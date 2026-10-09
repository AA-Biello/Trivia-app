"use server";

import { revalidatePath } from "next/cache";

import { requireHostSessionForGame } from "@/lib/auth/sessions";
import { broadcastGameState } from "@/lib/game/play-broadcast";
import { loadPublicGameState } from "@/lib/game/play-state";
import {
  ANSWER_GRADE_REASON,
  resolveGradePoints,
} from "@/lib/game/scoring";
import { createAdminClient } from "@/lib/supabase/admin";
import type { GameStatus } from "@/types/game";

export type HostGradeActionState = {
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
      roundId: string;
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
    .select("status, current_round_id")
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
  if (!game.current_round_id) {
    return { ok: false, error: "No active round." };
  }

  return {
    ok: true,
    admin,
    status: game.status as GameStatus,
    roundId: game.current_round_id,
  };
}

export async function enterRoundReviewAction(
  _prev: HostGradeActionState,
  formData: FormData,
): Promise<HostGradeActionState> {
  const gameId = String(formData.get("gameId") ?? "");
  const gate = await requireHostGame(gameId, ["ROUND_BREAK"]);
  if (!gate.ok) {
    return { error: gate.error };
  }

  const { error } = await gate.admin
    .from("games")
    .update({ status: "ROUND_REVIEW" })
    .eq("id", gameId);

  if (error) {
    return { error: "Could not enter review." };
  }

  await publishGameState(gameId);
  return { ok: true };
}

export async function saveCorrectAnswerAction(
  _prev: HostGradeActionState,
  formData: FormData,
): Promise<HostGradeActionState> {
  const gameId = String(formData.get("gameId") ?? "");
  const questionId = String(formData.get("questionId") ?? "");
  const correctAnswer = String(formData.get("correctAnswer") ?? "").trim();

  const gate = await requireHostGame(gameId, ["ROUND_REVIEW", "ROUND_BREAK"]);
  if (!gate.ok) {
    return { error: gate.error };
  }

  const { data: question } = await gate.admin
    .from("questions")
    .select("id, game_id")
    .eq("id", questionId)
    .eq("game_id", gameId)
    .maybeSingle();

  if (!question) {
    return { error: "Question not found for this game." };
  }

  const { error } = await gate.admin.from("question_secrets").upsert({
    question_id: questionId,
    correct_answer: correctAnswer,
  });

  if (error) {
    console.error("saveCorrectAnswer", error);
    return { error: "Could not save correct answer." };
  }

  revalidatePath(`/host/${gameId}`);
  return { ok: true };
}

export async function gradeAnswerAction(
  _prev: HostGradeActionState,
  formData: FormData,
): Promise<HostGradeActionState> {
  const gameId = String(formData.get("gameId") ?? "");
  const answerId = String(formData.get("answerId") ?? "");
  const mark = String(formData.get("mark") ?? "");
  const pointsRaw = formData.get("points");

  const gate = await requireHostGame(gameId, ["ROUND_REVIEW"]);
  if (!gate.ok) {
    return { error: gate.error };
  }

  if (mark !== "correct" && mark !== "incorrect") {
    return { error: "Mark answer correct or incorrect." };
  }

  const isCorrect = mark === "correct";
  const pointsOverride =
    pointsRaw != null && String(pointsRaw).trim() !== ""
      ? Number.parseInt(String(pointsRaw), 10)
      : null;

  if (pointsOverride != null && !Number.isInteger(pointsOverride)) {
    return { error: "Points must be a whole number." };
  }

  const pointsAwarded = resolveGradePoints({ isCorrect, pointsOverride });

  const { data: answer } = await gate.admin
    .from("answers")
    .select("id, game_id")
    .eq("id", answerId)
    .eq("game_id", gameId)
    .maybeSingle();

  if (!answer) {
    return { error: "Answer not found for this game." };
  }

  const { error } = await gate.admin.from("answer_grades").upsert({
    answer_id: answerId,
    is_correct: isCorrect,
    points_awarded: pointsAwarded,
    graded_at: new Date().toISOString(),
  });

  if (error) {
    console.error("gradeAnswer", error);
    return { error: "Could not save grade." };
  }

  revalidatePath(`/host/${gameId}`);
  return { ok: true };
}

export async function startRevealAction(
  _prev: HostGradeActionState,
  formData: FormData,
): Promise<HostGradeActionState> {
  const gameId = String(formData.get("gameId") ?? "");
  const gate = await requireHostGame(gameId, ["ROUND_REVIEW"]);
  if (!gate.ok) {
    return { error: gate.error };
  }

  const { data: firstQuestion } = await gate.admin
    .from("questions")
    .select("id")
    .eq("round_id", gate.roundId)
    .order("position", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!firstQuestion) {
    return { error: "No questions to reveal." };
  }

  const { error: revealError } = await gate.admin.from("game_reveal_state").upsert({
    game_id: gameId,
    round_id: gate.roundId,
    current_question_id: firstQuestion.id,
    correct_answer_revealed: false,
    team_answers_revealed: false,
  });

  if (revealError) {
    console.error("startReveal state", revealError);
    return { error: "Could not start reveal." };
  }

  const { error } = await gate.admin
    .from("games")
    .update({
      status: "REVEAL",
      current_question_id: firstQuestion.id,
    })
    .eq("id", gameId);

  if (error) {
    return { error: "Could not enter reveal mode." };
  }

  await publishGameState(gameId);
  return { ok: true };
}

async function updateRevealFlags(
  gameId: string,
  patch: {
    correct_answer_revealed?: boolean;
    team_answers_revealed?: boolean;
    current_question_id?: string;
  },
): Promise<HostGradeActionState> {
  const gate = await requireHostGame(gameId, ["REVEAL"]);
  if (!gate.ok) {
    return { error: gate.error };
  }

  const { error } = await gate.admin
    .from("game_reveal_state")
    .update(patch)
    .eq("game_id", gameId);

  if (error) {
    console.error("updateRevealFlags", error);
    return { error: "Could not update reveal state." };
  }

  if (patch.current_question_id) {
    await gate.admin
      .from("games")
      .update({ current_question_id: patch.current_question_id })
      .eq("id", gameId);
  }

  await publishGameState(gameId);
  return { ok: true };
}

export async function revealCorrectAnswerAction(
  _prev: HostGradeActionState,
  formData: FormData,
): Promise<HostGradeActionState> {
  const gameId = String(formData.get("gameId") ?? "");
  return updateRevealFlags(gameId, { correct_answer_revealed: true });
}

export async function revealTeamAnswersAction(
  _prev: HostGradeActionState,
  formData: FormData,
): Promise<HostGradeActionState> {
  const gameId = String(formData.get("gameId") ?? "");
  return updateRevealFlags(gameId, {
    correct_answer_revealed: true,
    team_answers_revealed: true,
  });
}

export async function hideRevealAction(
  _prev: HostGradeActionState,
  formData: FormData,
): Promise<HostGradeActionState> {
  const gameId = String(formData.get("gameId") ?? "");
  return updateRevealFlags(gameId, {
    correct_answer_revealed: false,
    team_answers_revealed: false,
  });
}

export async function revealGoToQuestionAction(
  _prev: HostGradeActionState,
  formData: FormData,
): Promise<HostGradeActionState> {
  const gameId = String(formData.get("gameId") ?? "");
  const direction = String(formData.get("direction") ?? "");

  const gate = await requireHostGame(gameId, ["REVEAL"]);
  if (!gate.ok) {
    return { error: gate.error };
  }

  const { data: reveal } = await gate.admin
    .from("game_reveal_state")
    .select("current_question_id, round_id")
    .eq("game_id", gameId)
    .single();

  if (!reveal?.current_question_id) {
    return { error: "No current reveal question." };
  }

  const { data: current } = await gate.admin
    .from("questions")
    .select("position")
    .eq("id", reveal.current_question_id)
    .single();

  if (!current) {
    return { error: "Current question missing." };
  }

  const nextPos =
    direction === "prev" ? current.position - 1 : current.position + 1;

  const { data: next } = await gate.admin
    .from("questions")
    .select("id")
    .eq("round_id", reveal.round_id)
    .eq("position", nextPos)
    .maybeSingle();

  if (!next) {
    return { error: direction === "prev" ? "Already at first question." : "Already at last question." };
  }

  return updateRevealFlags(gameId, {
    current_question_id: next.id,
    correct_answer_revealed: false,
    team_answers_revealed: false,
  });
}

export async function finishRevealAction(
  _prev: HostGradeActionState,
  formData: FormData,
): Promise<HostGradeActionState> {
  const gameId = String(formData.get("gameId") ?? "");
  const gate = await requireHostGame(gameId, ["REVEAL"]);
  if (!gate.ok) {
    return { error: gate.error };
  }

  const { error } = await gate.admin
    .from("games")
    .update({ status: "RESULTS_PUBLISHED" })
    .eq("id", gameId);

  if (error) {
    return { error: "Could not finish reveal." };
  }

  await publishGameState(gameId);
  return { ok: true };
}

/**
 * Publish scoreboard from host-approved grades.
 * Idempotent via unique (game_id, team_id, question_id) for answer_grade events.
 */
export async function publishScoreboardAction(
  _prev: HostGradeActionState,
  formData: FormData,
): Promise<HostGradeActionState> {
  const gameId = String(formData.get("gameId") ?? "");
  const gate = await requireHostGame(gameId, [
    "REVEAL",
    "RESULTS_PUBLISHED",
    "SCOREBOARD",
  ]);
  if (!gate.ok) {
    return { error: gate.error };
  }

  const { data: questions } = await gate.admin
    .from("questions")
    .select("id")
    .eq("round_id", gate.roundId);

  const questionIds = (questions ?? []).map((q) => q.id);
  if (questionIds.length === 0) {
    return { error: "No questions in this round." };
  }

  const { data: answers } = await gate.admin
    .from("answers")
    .select("id, team_id, question_id")
    .in("question_id", questionIds);

  const answerRows = answers ?? [];
  const answerIds = answerRows.map((a) => a.id);

  const { data: grades } =
    answerIds.length > 0
      ? await gate.admin
          .from("answer_grades")
          .select("answer_id, points_awarded, is_correct")
          .in("answer_id", answerIds)
      : { data: [] };

  const gradeByAnswer = new Map((grades ?? []).map((g) => [g.answer_id, g]));
  const now = new Date().toISOString();

  for (const answer of answerRows) {
    const grade = gradeByAnswer.get(answer.id);
    if (!grade || grade.is_correct == null) {
      continue;
    }

    const { data: existing } = await gate.admin
      .from("score_events")
      .select("id")
      .eq("game_id", gameId)
      .eq("team_id", answer.team_id)
      .eq("question_id", answer.question_id)
      .eq("reason", ANSWER_GRADE_REASON)
      .maybeSingle();

    if (existing) {
      const { error: updateError } = await gate.admin
        .from("score_events")
        .update({
          delta: grade.points_awarded,
          published_at: now,
          round_id: gate.roundId,
        })
        .eq("id", existing.id);
      if (updateError) {
        console.error("publishScoreboard update", updateError);
        return { error: "Could not publish scores." };
      }
    } else {
      const { error: insertError } = await gate.admin.from("score_events").insert({
        game_id: gameId,
        team_id: answer.team_id,
        question_id: answer.question_id,
        round_id: gate.roundId,
        delta: grade.points_awarded,
        reason: ANSWER_GRADE_REASON,
        published_at: now,
      });
      if (insertError) {
        console.error("publishScoreboard insert", insertError);
        return { error: "Could not publish scores." };
      }
    }
  }

  const { data: events } = await gate.admin
    .from("score_events")
    .select("team_id, delta")
    .eq("game_id", gameId)
    .eq("reason", ANSWER_GRADE_REASON)
    .not("published_at", "is", null);

  const totals = new Map<string, number>();
  for (const event of events ?? []) {
    totals.set(event.team_id, (totals.get(event.team_id) ?? 0) + event.delta);
  }

  const { data: teams } = await gate.admin
    .from("teams")
    .select("id")
    .eq("game_id", gameId);

  for (const team of teams ?? []) {
    await gate.admin
      .from("teams")
      .update({ display_score: totals.get(team.id) ?? 0 })
      .eq("id", team.id);
  }

  // Mark questions as results-published for this round (per-question gate).
  await gate.admin
    .from("questions")
    .update({ results_published_at: now })
    .eq("round_id", gate.roundId);

  const { error: statusError } = await gate.admin
    .from("games")
    .update({ status: "SCOREBOARD" })
    .eq("id", gameId);

  if (statusError) {
    return { error: "Scores saved but could not open scoreboard." };
  }

  await publishGameState(gameId);
  return { ok: true };
}
