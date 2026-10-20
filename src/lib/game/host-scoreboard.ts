import "server-only";

import { ANSWER_GRADE_REASON, rankTeamsByTotal } from "@/lib/game/scoring";
import { FINAL_WAGER_REASON, applyFinalScore } from "@/lib/game/wager-rules";
import { createAdminClient } from "@/lib/supabase/admin";

export type HostRunningScoreRow = {
  teamId: string;
  teamName: string;
  totalPoints: number;
  rank: number;
  /** Projected final total when grading final answers (host-only preview). */
  projectedFinalPoints: number | null;
};

/**
 * Host-only cumulative standings. Safe to show anytime — never broadcast to teams.
 */
export async function loadHostRunningScoreboard(
  gameId: string,
): Promise<HostRunningScoreRow[]> {
  const admin = createAdminClient();

  const { data: game } = await admin
    .from("games")
    .select("status, current_question_id")
    .eq("id", gameId)
    .maybeSingle();

  const { data: teams } = await admin
    .from("teams")
    .select("id, name, display_score")
    .eq("game_id", gameId)
    .order("name", { ascending: true });

  const teamList = teams ?? [];
  if (teamList.length === 0) return [];

  const { data: events } = await admin
    .from("score_events")
    .select("team_id, delta, reason, published_at")
    .eq("game_id", gameId)
    .not("published_at", "is", null);

  const totals = new Map<string, number>();
  for (const team of teamList) {
    totals.set(team.id, 0);
  }
  for (const event of events ?? []) {
    if (
      event.reason !== ANSWER_GRADE_REASON &&
      event.reason !== FINAL_WAGER_REASON
    ) {
      continue;
    }
    totals.set(event.team_id, (totals.get(event.team_id) ?? 0) + event.delta);
  }

  // Prefer ledger totals; fall back to display_score if ledger empty for a team.
  const baseRows = teamList.map((team) => {
    const fromLedger = totals.get(team.id) ?? 0;
    const hasLedger = (events ?? []).some((e) => e.team_id === team.id);
    return {
      teamId: team.id,
      teamName: team.name,
      roundPoints: 0,
      totalPoints: hasLedger ? fromLedger : team.display_score,
    };
  });

  const ranked = rankTeamsByTotal(baseRows);

  // Host preview of final wager grades before public publish.
  // Only during FINAL_REVIEW (grades exist / no-answer = incorrect).
  const projected = new Map<string, number>();
  if (game && game.status === "FINAL_REVIEW" && game.current_question_id) {
    const questionId = game.current_question_id;
    const startingByTeam = new Map(
      ranked.map((r) => {
        // Starting score = published answer_grade only (exclude prior final_wager).
        const start = (events ?? [])
          .filter(
            (e) =>
              e.team_id === r.teamId && e.reason === ANSWER_GRADE_REASON,
          )
          .reduce((sum, e) => sum + e.delta, 0);
        return [r.teamId, start] as const;
      }),
    );

    const [{ data: wagers }, { data: answers }] = await Promise.all([
      admin
        .from("wagers")
        .select("team_id, amount")
        .eq("question_id", questionId),
      admin
        .from("answers")
        .select("id, team_id")
        .eq("question_id", questionId),
    ]);

    const answerIds = (answers ?? []).map((a) => a.id);
    const { data: grades } =
      answerIds.length > 0
        ? await admin
            .from("answer_grades")
            .select("answer_id, is_correct")
            .in("answer_id", answerIds)
        : { data: [] };

    const wagerByTeam = new Map((wagers ?? []).map((w) => [w.team_id, w.amount]));
    const answerByTeam = new Map((answers ?? []).map((a) => [a.team_id, a]));
    const gradeByAnswer = new Map((grades ?? []).map((g) => [g.answer_id, g]));

    for (const team of teamList) {
      const start = startingByTeam.get(team.id) ?? 0;
      const wager = wagerByTeam.get(team.id) ?? 0;
      const answer = answerByTeam.get(team.id);
      const grade = answer ? gradeByAnswer.get(answer.id) : undefined;
      if (grade?.is_correct == null && !answer) {
        // No answer yet — show start only as projection baseline.
        projected.set(team.id, start);
        continue;
      }
      const isCorrect = grade?.is_correct === true;
      projected.set(team.id, Math.max(0, applyFinalScore(start, isCorrect, wager)));
    }
  }

  return ranked.map((row) => ({
    teamId: row.teamId,
    teamName: row.teamName,
    totalPoints: row.totalPoints,
    rank: row.rank,
    projectedFinalPoints: projected.has(row.teamId)
      ? (projected.get(row.teamId) ?? null)
      : null,
  }));
}
