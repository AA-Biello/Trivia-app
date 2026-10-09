"use server";

import { revalidatePath } from "next/cache";

import { requireHostSessionForGame } from "@/lib/auth/sessions";
import { broadcastGameState } from "@/lib/game/play-broadcast";
import { loadPublicGameState } from "@/lib/game/play-state";
import { clearRevealStateForGame } from "@/lib/game/round-state";
import {
  FINAL_WAGER_REASON,
  canEnterFinalReview,
  canGradeFinal,
  canPublishFinalResults,
  canStartFinalWager,
  finalWagerDelta,
  parseWagerAmount,
} from "@/lib/game/wager-rules";
import { createAdminClient } from "@/lib/supabase/admin";
import type { GameStatus } from "@/types/game";

export type HostFinalActionState = {
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

type HostGameGate =
  | {
      ok: true;
      admin: ReturnType<typeof createAdminClient>;
      status: GameStatus;
      roundId: string | null;
      questionId: string | null;
    }
  | { ok: false; error: string };

async function requireHostGame(
  gameId: string,
  allowed: GameStatus[],
): Promise<HostGameGate> {
  try {
    await requireHostSessionForGame(gameId);
  } catch {
    return { ok: false, error: "Host session invalid for this game." };
  }

  const admin = createAdminClient();
  const { data: game } = await admin
    .from("games")
    .select("status, current_round_id, current_question_id")
    .eq("id", gameId)
    .single();

  if (!game) {
    return { ok: false, error: "Game not found." };
  }
  if (!allowed.includes(game.status as GameStatus)) {
    return {
      ok: false,
      error: `Action not allowed while status is ${game.status}.`,
    };
  }

  return {
    ok: true,
    admin,
    status: game.status as GameStatus,
    roundId: game.current_round_id,
    questionId: game.current_question_id,
  };
}

/**
 * Explicit SCOREBOARD → FINAL_QUESTION.
 * Teams see the prompt and lock answer + wager together.
 * Does not run automatically after a round scoreboard.
 */
export async function startFinalWagerAction(
  _prev: HostFinalActionState,
  formData: FormData,
): Promise<HostFinalActionState> {
  const gameId = String(formData.get("gameId") ?? "");
  const prompt = String(formData.get("prompt") ?? "").trim();
  const correctAnswer = String(formData.get("correctAnswer") ?? "").trim();
  const maxWager = parseWagerAmount(formData.get("maxWager"));

  const gate = await requireHostGame(gameId, ["SCOREBOARD"]);
  if (!gate.ok) {
    return { error: gate.error };
  }
  if (!canStartFinalWager(gate.status)) {
    return { error: "Final wager can only start from the scoreboard." };
  }
  if (!prompt) {
    return { error: "Enter the final question prompt." };
  }
  if (!correctAnswer) {
    return { error: "Enter the correct answer (host only)." };
  }
  if (maxWager == null || maxWager < 0) {
    return { error: "Enter a valid maximum wager (0 or more)." };
  }

  const { data: existingFinal } = await gate.admin
    .from("rounds")
    .select("id")
    .eq("game_id", gameId)
    .eq("kind", "final")
    .limit(1);

  if (existingFinal && existingFinal.length > 0) {
    return { error: "This game already has a final round." };
  }

  const { data: lastRound } = await gate.admin
    .from("rounds")
    .select("position")
    .eq("game_id", gameId)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();

  const position = (lastRound?.position ?? 0) + 1;

  const { data: round, error: roundError } = await gate.admin
    .from("rounds")
    .insert({
      game_id: gameId,
      position,
      title: "Final wager",
      kind: "final",
      planned_question_count: 1,
      max_wager: maxWager,
    })
    .select("id")
    .single();

  if (roundError || !round) {
    console.error("startFinalWager round", roundError);
    return { error: "Could not create the final round." };
  }

  const { data: question, error: questionError } = await gate.admin
    .from("questions")
    .insert({
      game_id: gameId,
      round_id: round.id,
      position: 1,
      prompt,
      point_value: 0,
    })
    .select("id")
    .single();

  if (questionError || !question) {
    await gate.admin.from("rounds").delete().eq("id", round.id);
    console.error("startFinalWager question", questionError);
    return { error: "Could not create the final question." };
  }

  const { error: secretError } = await gate.admin.from("question_secrets").insert({
    question_id: question.id,
    correct_answer: correctAnswer,
  });

  if (secretError) {
    await gate.admin.from("rounds").delete().eq("id", round.id);
    console.error("startFinalWager secret", secretError);
    return { error: "Could not save the correct answer." };
  }

  await clearRevealStateForGame(gameId);

  const { error: statusError } = await gate.admin
    .from("games")
    .update({
      status: "FINAL_QUESTION",
      current_round_id: round.id,
      current_question_id: question.id,
    })
    .eq("id", gameId);

  if (statusError) {
    return { error: "Could not open the final question." };
  }

  await publishGameState(gameId);
  return { ok: true };
}

export async function enterFinalReviewAction(
  _prev: HostFinalActionState,
  formData: FormData,
): Promise<HostFinalActionState> {
  const gameId = String(formData.get("gameId") ?? "");
  const gate = await requireHostGame(gameId, ["FINAL_QUESTION"]);
  if (!gate.ok) {
    return { error: gate.error };
  }
  if (!canEnterFinalReview(gate.status)) {
    return { error: "Cannot enter final review right now." };
  }

  const { error } = await gate.admin
    .from("games")
    .update({ status: "FINAL_REVIEW" })
    .eq("id", gameId);

  if (error) {
    return { error: "Could not enter final review." };
  }

  await publishGameState(gameId);
  return { ok: true };
}

export async function gradeFinalAnswerAction(
  _prev: HostFinalActionState,
  formData: FormData,
): Promise<HostFinalActionState> {
  const gameId = String(formData.get("gameId") ?? "");
  const answerId = String(formData.get("answerId") ?? "");
  const mark = String(formData.get("mark") ?? "");

  const gate = await requireHostGame(gameId, ["FINAL_REVIEW"]);
  if (!gate.ok) {
    return { error: gate.error };
  }
  if (!canGradeFinal(gate.status) || !gate.questionId) {
    return { error: "Cannot grade final answers right now." };
  }
  if (mark !== "correct" && mark !== "incorrect") {
    return { error: "Mark answer correct or incorrect." };
  }

  const { data: answer } = await gate.admin
    .from("answers")
    .select("id, team_id, game_id, question_id")
    .eq("id", answerId)
    .eq("game_id", gameId)
    .eq("question_id", gate.questionId)
    .maybeSingle();

  if (!answer) {
    return { error: "Answer not found for this game." };
  }

  const { data: wager } = await gate.admin
    .from("wagers")
    .select("amount")
    .eq("question_id", gate.questionId)
    .eq("team_id", answer.team_id)
    .maybeSingle();

  const wagerAmount = wager?.amount ?? 0;
  const isCorrect = mark === "correct";
  const pointsAwarded = finalWagerDelta(isCorrect, wagerAmount);

  const { error } = await gate.admin.from("answer_grades").upsert({
    answer_id: answer.id,
    is_correct: isCorrect,
    points_awarded: pointsAwarded,
    graded_at: new Date().toISOString(),
  });

  if (error) {
    console.error("gradeFinalAnswer", error);
    return { error: "Could not save grade." };
  }

  revalidatePath(`/host/${gameId}`);
  return { ok: true };
}

export async function publishFinalResultsAction(
  _prev: HostFinalActionState,
  formData: FormData,
): Promise<HostFinalActionState> {
  const gameId = String(formData.get("gameId") ?? "");
  const gate = await requireHostGame(gameId, ["FINAL_REVIEW", "FINAL_RESULTS"]);
  if (!gate.ok) {
    return { error: gate.error };
  }
  if (!canPublishFinalResults(gate.status) || !gate.questionId || !gate.roundId) {
    return { error: "Cannot publish final results right now." };
  }

  const questionId = gate.questionId;
  const roundId = gate.roundId;
  const now = new Date().toISOString();

  const { data: teams } = await gate.admin
    .from("teams")
    .select("id, display_score")
    .eq("game_id", gameId);

  const { data: wagers } = await gate.admin
    .from("wagers")
    .select("id, team_id, amount")
    .eq("question_id", questionId);

  const { data: answers } = await gate.admin
    .from("answers")
    .select("id, team_id")
    .eq("question_id", questionId);

  const answerIds = (answers ?? []).map((a) => a.id);
  const { data: grades } =
    answerIds.length > 0
      ? await gate.admin
          .from("answer_grades")
          .select("answer_id, is_correct")
          .in("answer_id", answerIds)
      : { data: [] };

  const { data: preFinalEvents } = await gate.admin
    .from("score_events")
    .select("team_id, delta")
    .eq("game_id", gameId)
    .eq("reason", "answer_grade")
    .not("published_at", "is", null);

  const startingByTeam = new Map<string, number>();
  for (const team of teams ?? []) {
    startingByTeam.set(team.id, 0);
  }
  for (const event of preFinalEvents ?? []) {
    startingByTeam.set(
      event.team_id,
      (startingByTeam.get(event.team_id) ?? 0) + event.delta,
    );
  }

  const wagerByTeam = new Map((wagers ?? []).map((w) => [w.team_id, w.amount]));
  const answerByTeam = new Map((answers ?? []).map((a) => [a.team_id, a]));
  const gradeByAnswer = new Map((grades ?? []).map((g) => [g.answer_id, g]));

  for (const team of teams ?? []) {
    const wagerAmount = wagerByTeam.get(team.id) ?? 0;
    const answer = answerByTeam.get(team.id);
    const grade = answer ? gradeByAnswer.get(answer.id) : undefined;
    const isCorrect = grade?.is_correct === true;
    const delta = finalWagerDelta(isCorrect, wagerAmount);
    const starting = startingByTeam.get(team.id) ?? 0;
    const finalScore = Math.max(0, starting + delta);

    const { data: existing } = await gate.admin
      .from("score_events")
      .select("id")
      .eq("game_id", gameId)
      .eq("team_id", team.id)
      .eq("question_id", questionId)
      .eq("reason", FINAL_WAGER_REASON)
      .maybeSingle();

    if (existing) {
      const { error: updateError } = await gate.admin
        .from("score_events")
        .update({
          delta,
          published_at: now,
          round_id: roundId,
        })
        .eq("id", existing.id);
      if (updateError) {
        console.error("publishFinalResults update", updateError);
        return { error: "Could not publish final scores." };
      }
    } else {
      const { error: insertError } = await gate.admin.from("score_events").insert({
        game_id: gameId,
        team_id: team.id,
        question_id: questionId,
        round_id: roundId,
        delta,
        reason: FINAL_WAGER_REASON,
        published_at: now,
      });
      if (insertError) {
        console.error("publishFinalResults insert", insertError);
        return { error: "Could not publish final scores." };
      }
    }

    await gate.admin
      .from("teams")
      .update({ display_score: finalScore })
      .eq("id", team.id);
  }

  await gate.admin
    .from("wagers")
    .update({ revealed_at: now, locked_at: now })
    .eq("question_id", questionId)
    .is("revealed_at", null);

  await gate.admin
    .from("questions")
    .update({ results_published_at: now })
    .eq("id", questionId);

  const { error: statusError } = await gate.admin
    .from("games")
    .update({ status: "FINAL_RESULTS" })
    .eq("id", gameId);

  if (statusError) {
    return { error: "Scores saved but could not open final results." };
  }

  await publishGameState(gameId);
  return { ok: true };
}

/** @deprecated Use startFinalWagerAction — kept as alias for any stale imports. */
export const openFinalWagerAction = startFinalWagerAction;
