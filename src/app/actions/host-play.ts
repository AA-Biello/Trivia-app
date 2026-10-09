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

export async function createRoundAction(
  _prev: HostPlayActionState,
  formData: FormData,
): Promise<HostPlayActionState> {
  const gameId = String(formData.get("gameId") ?? "");
  const title = String(formData.get("title") ?? "").trim() || "Round 1";
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
    .select("status")
    .eq("id", gameId)
    .single();

  if (!game || !canCreateRound(game.status as GameStatus)) {
    return { error: "Rounds can only be created while the game is in the lobby." };
  }

  const { data: existing } = await admin
    .from("rounds")
    .select("id")
    .eq("game_id", gameId)
    .limit(1);
  if (existing && existing.length > 0) {
    return { error: "This game already has a round." };
  }

  const { data: round, error: roundError } = await admin
    .from("rounds")
    .insert({
      game_id: gameId,
      position: 1,
      title,
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

  await admin
    .from("games")
    .update({ current_round_id: round.id })
    .eq("id", gameId);

  revalidatePath(`/host/${gameId}`);
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

  // Completion follows the round's actual questions, not a fixed length.
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
