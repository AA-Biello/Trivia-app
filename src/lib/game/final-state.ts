import "server-only";

import type { PublicFinalResultsRow } from "@/lib/game/play-channel";
import { rankTeamsByTotal } from "@/lib/game/scoring";
import {
  FINAL_WAGER_REASON,
  applyFinalScore,
  type HostFinalReviewRow,
  type HostFinalSnapshot,
} from "@/lib/game/wager-rules";
import { createAdminClient } from "@/lib/supabase/admin";

export type { HostFinalReviewRow, HostFinalSnapshot };

export async function loadHostFinalSnapshot(
  gameId: string,
): Promise<HostFinalSnapshot | null> {
  const admin = createAdminClient();
  const { data: game } = await admin
    .from("games")
    .select("status, current_round_id, current_question_id")
    .eq("id", gameId)
    .maybeSingle();

  if (
    !game?.current_round_id ||
    !game.current_question_id ||
    !["FINAL_QUESTION", "FINAL_REVIEW", "FINAL_RESULTS", "GAME_OVER"].includes(
      game.status,
    )
  ) {
    return null;
  }

  const { data: round } = await admin
    .from("rounds")
    .select("id, max_wager, kind")
    .eq("id", game.current_round_id)
    .maybeSingle();

  if (!round || (round.kind !== "final" && round.kind !== "wager")) {
    return null;
  }

  const { data: question } = await admin
    .from("questions")
    .select("id, prompt")
    .eq("id", game.current_question_id)
    .maybeSingle();

  if (!question) {
    return null;
  }

  const { data: secret } = await admin
    .from("question_secrets")
    .select("correct_answer")
    .eq("question_id", question.id)
    .maybeSingle();

  const { data: teams } = await admin
    .from("teams")
    .select("id, name, display_score")
    .eq("game_id", gameId)
    .order("created_at", { ascending: true });

  const { data: wagers } = await admin
    .from("wagers")
    .select("team_id, amount, locked_at")
    .eq("question_id", question.id);

  const { data: answers } = await admin
    .from("answers")
    .select("id, team_id, answer_text")
    .eq("question_id", question.id);

  const answerIds = (answers ?? []).map((a) => a.id);
  const { data: grades } =
    answerIds.length > 0
      ? await admin
          .from("answer_grades")
          .select("answer_id, is_correct, points_awarded")
          .in("answer_id", answerIds)
      : { data: [] };

  const wagerByTeam = new Map((wagers ?? []).map((w) => [w.team_id, w]));
  const answerByTeam = new Map((answers ?? []).map((a) => [a.team_id, a]));
  const gradeByAnswer = new Map((grades ?? []).map((g) => [g.answer_id, g]));

  const lockedTeamIds: string[] = [];
  const lockedTeamNames: string[] = [];
  for (const team of teams ?? []) {
    const wager = wagerByTeam.get(team.id);
    const answer = answerByTeam.get(team.id);
    if (wager?.locked_at && answer) {
      lockedTeamIds.push(team.id);
      lockedTeamNames.push(team.name);
    }
  }

  const { data: preFinalEvents } = await admin
    .from("score_events")
    .select("team_id, delta, reason")
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

  const reviewRows: HostFinalReviewRow[] = (teams ?? []).map((team) => {
    const wager = wagerByTeam.get(team.id);
    const answer = answerByTeam.get(team.id);
    const grade = answer ? gradeByAnswer.get(answer.id) : undefined;
    return {
      teamId: team.id,
      teamName: team.name,
      startingScore: startingByTeam.get(team.id) ?? team.display_score,
      wagerAmount: wager?.amount ?? null,
      wagerLocked: Boolean(wager?.locked_at),
      answerId: answer?.id ?? null,
      answerText: answer?.answer_text ?? null,
      isCorrect: grade?.is_correct ?? null,
      pointsAwarded: grade?.points_awarded ?? null,
    };
  });

  return {
    roundId: round.id,
    questionId: question.id,
    prompt: question.prompt,
    correctAnswer: secret?.correct_answer ?? "",
    maxWager: round.max_wager ?? 0,
    lockedTeamIds,
    lockedTeamNames,
    reviewRows,
  };
}

export async function loadPublishedFinalResults(
  gameId: string,
): Promise<PublicFinalResultsRow[] | null> {
  const admin = createAdminClient();
  const { data: game } = await admin
    .from("games")
    .select("status, current_question_id")
    .eq("id", gameId)
    .maybeSingle();

  if (
    !game ||
    (game.status !== "FINAL_RESULTS" && game.status !== "GAME_OVER") ||
    !game.current_question_id
  ) {
    return null;
  }

  const questionId = game.current_question_id;

  const { data: teams } = await admin
    .from("teams")
    .select("id, name, display_score")
    .eq("game_id", gameId);

  const { data: wagers } = await admin
    .from("wagers")
    .select("team_id, amount, revealed_at")
    .eq("question_id", questionId)
    .not("revealed_at", "is", null);

  const { data: answers } = await admin
    .from("answers")
    .select("id, team_id, answer_text")
    .eq("question_id", questionId);

  const answerIds = (answers ?? []).map((a) => a.id);
  const { data: grades } =
    answerIds.length > 0
      ? await admin
          .from("answer_grades")
          .select("answer_id, is_correct")
          .in("answer_id", answerIds)
      : { data: [] };

  const { data: preFinalEvents } = await admin
    .from("score_events")
    .select("team_id, delta")
    .eq("game_id", gameId)
    .eq("reason", "answer_grade")
    .not("published_at", "is", null);

  const { data: finalEvents } = await admin
    .from("score_events")
    .select("team_id, delta")
    .eq("game_id", gameId)
    .eq("reason", FINAL_WAGER_REASON)
    .eq("question_id", questionId)
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
  const finalDeltaByTeam = new Map(
    (finalEvents ?? []).map((e) => [e.team_id, e.delta]),
  );

  const rows = (teams ?? []).map((team) => {
    const startingScore = startingByTeam.get(team.id) ?? 0;
    const wager = wagerByTeam.get(team.id) ?? 0;
    const answer = answerByTeam.get(team.id);
    const grade = answer ? gradeByAnswer.get(answer.id) : undefined;
    const isCorrect = grade?.is_correct === true;
    const finalScore = finalDeltaByTeam.has(team.id)
      ? startingScore + (finalDeltaByTeam.get(team.id) ?? 0)
      : applyFinalScore(startingScore, isCorrect, wager);

    return {
      teamId: team.id,
      teamName: team.name,
      startingScore,
      wager,
      answerText: answer?.answer_text ?? null,
      isCorrect,
      roundPoints: wager,
      totalPoints: finalScore,
      finalScore,
    };
  });

  const ranked = rankTeamsByTotal(
    rows.map(({ teamId, teamName, roundPoints, totalPoints }) => ({
      teamId,
      teamName,
      roundPoints,
      totalPoints,
    })),
  );
  const byId = new Map(rows.map((r) => [r.teamId, r]));

  return ranked.map((row) => {
    const full = byId.get(row.teamId)!;
    return {
      teamName: full.teamName,
      startingScore: full.startingScore,
      wager: full.wager,
      answerText: full.answerText,
      isCorrect: full.isCorrect,
      finalScore: full.finalScore,
      rank: row.rank,
    };
  });
}
