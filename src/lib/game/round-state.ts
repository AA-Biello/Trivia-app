import "server-only";

import {
  formatRoundDisplayType,
  resolveRoundDisplayType,
  resolveRoundListStatus,
  type HostRoundListItem,
} from "@/lib/game/round-rules";
import { ANSWER_GRADE_REASON } from "@/lib/game/scoring";
import { createAdminClient } from "@/lib/supabase/admin";
import type { GameStatus } from "@/types/game";

export type { HostRoundListItem };

export async function loadHostRoundList(
  gameId: string,
): Promise<HostRoundListItem[]> {
  const admin = createAdminClient();
  const { data: game } = await admin
    .from("games")
    .select("status, current_round_id")
    .eq("id", gameId)
    .maybeSingle();

  if (!game) return [];

  const { data: rounds } = await admin
    .from("rounds")
    .select("id, position, title, kind, planned_question_count")
    .eq("game_id", gameId)
    .order("position", { ascending: true });

  const roundList = rounds ?? [];
  if (roundList.length === 0) return [];

  const roundIds = roundList.map((r) => r.id);
  const { data: questions } = await admin
    .from("questions")
    .select("id, round_id")
    .in("round_id", roundIds);

  const questionsByRound = new Map<string, string[]>();
  for (const q of questions ?? []) {
    const list = questionsByRound.get(q.round_id) ?? [];
    list.push(q.id);
    questionsByRound.set(q.round_id, list);
  }

  const allQuestionIds = (questions ?? []).map((q) => q.id);
  const { data: scoreEvents } =
    allQuestionIds.length > 0
      ? await admin
          .from("score_events")
          .select("question_id, round_id")
          .eq("game_id", gameId)
          .eq("reason", ANSWER_GRADE_REASON)
          .not("published_at", "is", null)
          .in("question_id", allQuestionIds)
      : { data: [] };

  const scoredRoundIds = new Set<string>();
  for (const event of scoreEvents ?? []) {
    if (event.round_id) scoredRoundIds.add(event.round_id);
  }

  return roundList.map((round) => {
    const qIds = questionsByRound.get(round.id) ?? [];
    const questionCount =
      qIds.length > 0 ? qIds.length : round.planned_question_count;
    const displayType = resolveRoundDisplayType({
      kind: round.kind,
      questionCount,
    });
    const isFinal = round.kind === "final" || round.kind === "wager";

    return {
      id: round.id,
      position: round.position,
      title: round.title,
      kind: round.kind,
      displayType,
      displayTypeLabel: formatRoundDisplayType(displayType),
      questionCount,
      status: resolveRoundListStatus({
        roundId: round.id,
        currentRoundId: game.current_round_id,
        gameStatus: game.status as GameStatus,
        hasPublishedScores: scoredRoundIds.has(round.id),
      }),
      isFinal,
    };
  });
}

export async function clearRevealStateForGame(gameId: string): Promise<void> {
  const admin = createAdminClient();
  await admin.from("game_reveal_state").delete().eq("game_id", gameId);
}
