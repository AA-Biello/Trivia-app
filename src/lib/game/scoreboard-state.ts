import "server-only";

import type { PublicScoreboardRow } from "@/lib/game/play-channel";
import { ANSWER_GRADE_REASON, rankTeamsByTotal } from "@/lib/game/scoring";
import { createAdminClient } from "@/lib/supabase/admin";

export async function loadPublishedScoreboard(
  gameId: string,
  roundId: string | null,
): Promise<PublicScoreboardRow[] | null> {
  const admin = createAdminClient();

  const { data: game } = await admin
    .from("games")
    .select("status")
    .eq("id", gameId)
    .maybeSingle();

  // Scoreboard is public only after host publishes (SCOREBOARD), not merely
  // after reveal finishes (RESULTS_PUBLISHED).
  if (!game || (game.status !== "SCOREBOARD" && game.status !== "GAME_OVER")) {
    return null;
  }

  const { data: teams } = await admin
    .from("teams")
    .select("id, name, display_score")
    .eq("game_id", gameId);

  const { data: events } = await admin
    .from("score_events")
    .select("team_id, delta, round_id, published_at, reason")
    .eq("game_id", gameId)
    .eq("reason", ANSWER_GRADE_REASON)
    .not("published_at", "is", null);

  const rows = (teams ?? []).map((team) => {
    const teamEvents = (events ?? []).filter((e) => e.team_id === team.id);
    const totalPoints = teamEvents.reduce((sum, e) => sum + e.delta, 0);
    const roundPoints = teamEvents
      .filter((e) => (roundId ? e.round_id === roundId : true))
      .reduce((sum, e) => sum + e.delta, 0);

    return {
      teamId: team.id,
      teamName: team.name,
      roundPoints,
      totalPoints: totalPoints || team.display_score,
    };
  });

  return rankTeamsByTotal(rows).map(({ teamName, roundPoints, totalPoints, rank }) => ({
    teamName,
    roundPoints,
    totalPoints,
    rank,
  }));
}
