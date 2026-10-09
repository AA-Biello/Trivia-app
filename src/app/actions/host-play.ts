"use server";

import { revalidatePath } from "next/cache";

import { requireHostSessionForGame } from "@/lib/auth/sessions";
import { broadcastGameState } from "@/lib/game/play-broadcast";
import {
  canCloseQuestion,
  canCreateRound,
  canOpenQuestion,
  nextQuestionPosition,
  nextStepAfterClose,
  parseQuestionCount,
} from "@/lib/game/play-rules";
import { loadPublicGameState } from "@/lib/game/play-state";
import {
  canCreateNextRound,
  canStartNextRound,
  findNextPlayableRound,
} from "@/lib/game/round-rules";
import { clearRevealStateForGame } from "@/lib/game/round-state";
import { createAdminClient } from "@/lib/supabase/admin";
import type { GameStatus } from "@/types/game";

export type HostPlayActionState = {
  error?: string;
  ok?: boolean;
} | null;

async function publishGameState(gameId: string) {
  const state = await loadPublicGameState(gameId);
  try {
    await broadcastGameState(gameId, state);
  } catch (error) {
    console.error("broadcastGameState", error);
  }
  revalidatePath(`/host/${gameId}`);
  revalidatePath(`/game/${gameId}`);
}

/**
 * Create a standard/music/custom round.
 * - LOBBY: first (or additional pre-game) round; becomes current if none set.
 * - SCOREBOARD: create next round without starting it (status stays SCOREBOARD).
 */
export async function createRoundAction(
  _prev: HostPlayActionState,
  formData: FormData,
): Promise<HostPlayActionState> {
  const gameId = String(formData.get("gameId") ?? "");
  const title = String(formData.get("title") ?? "").trim() || "Round";
  const questionCount = parseQuestionCount(formData.get("questionCount"));

  try {
    await requireHostSessionForGame(gameId);
  } catch {
    return { error: "Host session invalid for this game." };
  }

  if (questionCount == null) {
    return { error: "Choose a valid number of questions for this round." };
  }

  const prompts: string[] = [];
  const correctAnswers: string[] = [];
  for (let i = 1; i <= questionCount; i += 1) {
    const prompt = String(formData.get(`prompt${i}`) ?? "").trim();
    if (!prompt) {
      return { error: `Enter a prompt for question ${i}.` };
    }
    prompts.push(prompt);
    correctAnswers.push(String(formData.get(`correct${i}`) ?? "").trim());
  }

  const admin = createAdminClient();
  const { data: game } = await admin
    .from("games")
    .select("status, current_round_id")
    .eq("id", gameId)
    .single();

  if (!game || !canCreateRound(game.status as GameStatus)) {
    return {
      error: "Rounds can only be created in the lobby or after a scoreboard.",
    };
  }

  if (
    game.status === "SCOREBOARD" &&
    !canCreateNextRound(game.status as GameStatus)
  ) {
    return { error: "Cannot create another round right now." };
  }

  const { data: existingFinal } = await admin
    .from("rounds")
    .select("id")
    .eq("game_id", gameId)
    .eq("kind", "final")
    .limit(1);
  if (existingFinal && existingFinal.length > 0) {
    return { error: "Cannot add rounds after the final wager has been created." };
  }

  const { data: lastRound } = await admin
    .from("rounds")
    .select("position")
    .eq("game_id", gameId)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();

  const position = (lastRound?.position ?? 0) + 1;
  const defaultTitle =
    title === "Round" || title === "Round 1" ? `Round ${position}` : title;

  const { data: round, error: roundError } = await admin
    .from("rounds")
    .insert({
      game_id: gameId,
      position,
      title: defaultTitle,
      kind: "standard",
      planned_question_count: questionCount,
    })
    .select("id")
    .single();

  if (roundError || !round) {
    console.error("createRound", roundError);
    return { error: "Could not create the round." };
  }

  const questionRows = prompts.map((prompt, index) => ({
    game_id: gameId,
    round_id: round.id,
    position: index + 1,
    prompt,
    point_value: 1,
  }));

  const { data: insertedQuestions, error: questionsError } = await admin
    .from("questions")
    .insert(questionRows)
    .select("id, position");

  if (questionsError || !insertedQuestions) {
    await admin.from("rounds").delete().eq("id", round.id);
    console.error("createRound questions", questionsError);
    return { error: "Could not save questions." };
  }

  const secretRows = insertedQuestions.map((question) => ({
    question_id: question.id,
    correct_answer: correctAnswers[question.position - 1] ?? "",
  }));

  const { error: secretsError } = await admin
    .from("question_secrets")
    .insert(secretRows);

  if (secretsError) {
    await admin.from("rounds").delete().eq("id", round.id);
    console.error("createRound secrets", secretsError);
    return { error: "Could not save correct answers." };
  }

  // Lobby: set as current if none. Scoreboard: leave current on scored round.
  if (game.status === "LOBBY" && !game.current_round_id) {
    await admin
      .from("games")
      .update({ current_round_id: round.id })
      .eq("id", gameId);
  }

  revalidatePath(`/host/${gameId}`);
  return { ok: true };
}

/**
 * SCOREBOARD → open the next authored standard round's first question.
 * Clears reveal state; preserves cumulative display_score / score_events.
 */
export async function startNextRoundAction(
  _prev: HostPlayActionState,
  formData: FormData,
): Promise<HostPlayActionState> {
  const gameId = String(formData.get("gameId") ?? "");
  const requestedRoundId = String(formData.get("roundId") ?? "") || null;

  try {
    await requireHostSessionForGame(gameId);
  } catch {
    return { error: "Host session invalid for this game." };
  }

  const admin = createAdminClient();
  const { data: game } = await admin
    .from("games")
    .select("status, current_round_id")
    .eq("id", gameId)
    .single();

  if (!game || !canStartNextRound(game.status as GameStatus)) {
    return { error: "Next round can only start from the scoreboard." };
  }

  const { data: rounds } = await admin
    .from("rounds")
    .select("id, position, kind")
    .eq("game_id", gameId)
    .order("position", { ascending: true });

  const next =
    requestedRoundId != null
      ? (rounds ?? []).find(
          (r) =>
            r.id === requestedRoundId &&
            r.kind !== "final" &&
            r.kind !== "wager",
        ) ?? null
      : findNextPlayableRound(rounds ?? [], game.current_round_id);

  if (!next) {
    return {
      error: "No next round is ready. Create another round, or start the final wager.",
    };
  }

  // Do not re-open a round that already has published answer_grade events.
  const { data: published } = await admin
    .from("score_events")
    .select("id")
    .eq("game_id", gameId)
    .eq("round_id", next.id)
    .eq("reason", "answer_grade")
    .not("published_at", "is", null)
    .limit(1);

  if (published && published.length > 0) {
    return { error: "That round has already been scored." };
  }

  const { data: firstQuestion } = await admin
    .from("questions")
    .select("id")
    .eq("round_id", next.id)
    .order("position", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!firstQuestion) {
    return { error: "Next round has no questions." };
  }

  await clearRevealStateForGame(gameId);

  const { error } = await admin
    .from("games")
    .update({
      status: "QUESTION_OPEN",
      current_round_id: next.id,
      current_question_id: firstQuestion.id,
    })
    .eq("id", gameId);

  if (error) {
    console.error("startNextRound", error);
    return { error: "Could not start the next round." };
  }

  await publishGameState(gameId);
  return { ok: true };
}

export async function openQuestionAction(
  _prev: HostPlayActionState,
  formData: FormData,
): Promise<HostPlayActionState> {
  const gameId = String(formData.get("gameId") ?? "");
  const questionId = String(formData.get("questionId") ?? "");

  try {
    await requireHostSessionForGame(gameId);
  } catch {
    return { error: "Host session invalid for this game." };
  }

  const admin = createAdminClient();
  const { data: game } = await admin
    .from("games")
    .select("status, current_round_id")
    .eq("id", gameId)
    .single();

  if (!game || !canOpenQuestion(game.status as GameStatus)) {
    return { error: "Cannot open a question from the current game state." };
  }

  const { data: question } = await admin
    .from("questions")
    .select("id, round_id, game_id")
    .eq("id", questionId)
    .eq("game_id", gameId)
    .maybeSingle();

  if (!question) {
    return { error: "Question not found for this game." };
  }

  const { error } = await admin
    .from("games")
    .update({
      status: "QUESTION_OPEN",
      current_round_id: question.round_id,
      current_question_id: question.id,
    })
    .eq("id", gameId);

  if (error) {
    console.error("openQuestion", error);
    return { error: "Could not open the question." };
  }

  await publishGameState(gameId);
  return { ok: true };
}

export async function closeQuestionAction(
  _prev: HostPlayActionState,
  formData: FormData,
): Promise<HostPlayActionState> {
  const gameId = String(formData.get("gameId") ?? "");

  try {
    await requireHostSessionForGame(gameId);
  } catch {
    return { error: "Host session invalid for this game." };
  }

  const admin = createAdminClient();
  const { data: game } = await admin
    .from("games")
    .select("status")
    .eq("id", gameId)
    .single();

  if (!game || !canCloseQuestion(game.status as GameStatus)) {
    return { error: "No open question to close." };
  }

  const { error } = await admin
    .from("games")
    .update({ status: "QUESTION_CLOSED" })
    .eq("id", gameId);

  if (error) {
    console.error("closeQuestion", error);
    return { error: "Could not close the question." };
  }

  await publishGameState(gameId);
  return { ok: true };
}

export async function advanceOrEndRoundAction(
  _prev: HostPlayActionState,
  formData: FormData,
): Promise<HostPlayActionState> {
  const gameId = String(formData.get("gameId") ?? "");

  try {
    await requireHostSessionForGame(gameId);
  } catch {
    return { error: "Host session invalid for this game." };
  }

  const admin = createAdminClient();
  const { data: game } = await admin
    .from("games")
    .select("status, current_question_id, current_round_id")
    .eq("id", gameId)
    .single();

  if (!game || game.status !== "QUESTION_CLOSED") {
    return { error: "Close the current question before advancing." };
  }
  if (!game.current_question_id || !game.current_round_id) {
    return { error: "No current question to advance from." };
  }

  const { data: current } = await admin
    .from("questions")
    .select("position, round_id")
    .eq("id", game.current_question_id)
    .single();

  if (!current) {
    return { error: "Current question missing." };
  }

  const nextPos = nextQuestionPosition(current.position);
  const { data: nextQuestion } = await admin
    .from("questions")
    .select("id")
    .eq("round_id", current.round_id)
    .eq("position", nextPos)
    .maybeSingle();

  const step = nextStepAfterClose(Boolean(nextQuestion));

  if (step === "round_break") {
    const { error } = await admin
      .from("games")
      .update({ status: "ROUND_BREAK" })
      .eq("id", gameId);
    if (error) {
      console.error("endRound", error);
      return { error: "Could not end the round." };
    }
    await publishGameState(gameId);
    return { ok: true };
  }

  const { error } = await admin
    .from("games")
    .update({
      status: "QUESTION_OPEN",
      current_question_id: nextQuestion!.id,
    })
    .eq("id", gameId);

  if (error) {
    console.error("advanceQuestion", error);
    return { error: "Could not open the next question." };
  }

  await publishGameState(gameId);
  return { ok: true };
}
