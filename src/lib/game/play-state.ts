import "server-only";

import type { PublicGameStatePayload } from "@/lib/game/play-channel";
import { createAdminClient } from "@/lib/supabase/admin";
import type { GameStatus } from "@/types/game";

export type HostPlaySnapshot = {
  status: GameStatus;
  round: {
    id: string;
    title: string;
    plannedQuestionCount: number;
  } | null;
  questions: Array<{
    id: string;
    position: number;
    prompt: string;
  }>;
  currentQuestion: {
    id: string;
    position: number;
    prompt: string;
  } | null;
  teamCount: number;
  submittedTeamIds: string[];
  submittedTeamNames: string[];
};

export type TeamPlaySnapshot = {
  status: GameStatus;
  gameTitle: string;
  teamName: string;
  publicState: PublicGameStatePayload;
  myAnswer: { text: string; submittedAt: string } | null;
};

export async function loadPublicGameState(
  gameId: string,
): Promise<PublicGameStatePayload> {
  const admin = createAdminClient();

  const { data: game } = await admin
    .from("games")
    .select("status, current_round_id, current_question_id")
    .eq("id", gameId)
    .single();

  if (!game) {
    return {
      status: "LOBBY",
      roundId: null,
      roundTitle: null,
      questionId: null,
      questionNumber: null,
      questionCount: null,
      prompt: null,
    };
  }

  let roundTitle: string | null = null;
  let questionCount: number | null = null;
  if (game.current_round_id) {
    const { data: round } = await admin
      .from("rounds")
      .select("title, planned_question_count")
      .eq("id", game.current_round_id)
      .maybeSingle();
    roundTitle = round?.title ?? null;

    const { count: actualCount } = await admin
      .from("questions")
      .select("id", { count: "exact", head: true })
      .eq("round_id", game.current_round_id);

    // Prefer the round's real question rows; fall back to planned count.
    questionCount =
      actualCount && actualCount > 0
        ? actualCount
        : (round?.planned_question_count ?? null);
  }

  let questionNumber: number | null = null;
  let prompt: string | null = null;
  if (game.current_question_id) {
    const { data: question } = await admin
      .from("questions")
      .select("position, prompt")
      .eq("id", game.current_question_id)
      .maybeSingle();
    questionNumber = question?.position ?? null;
    prompt = question?.prompt ?? null;
  }

  return {
    status: game.status as GameStatus,
    roundId: game.current_round_id,
    roundTitle,
    questionId: game.current_question_id,
    questionNumber,
    questionCount,
    prompt,
  };
}

export async function loadHostPlaySnapshot(
  gameId: string,
): Promise<HostPlaySnapshot> {
  const admin = createAdminClient();

  const { data: game } = await admin
    .from("games")
    .select("status, current_round_id, current_question_id")
    .eq("id", gameId)
    .single();

  const status = (game?.status ?? "LOBBY") as GameStatus;

  const { count: teamCount } = await admin
    .from("teams")
    .select("id", { count: "exact", head: true })
    .eq("game_id", gameId);

  const { data: rounds } = await admin
    .from("rounds")
    .select("id, title, planned_question_count, position")
    .eq("game_id", gameId)
    .order("position", { ascending: true })
    .limit(1);

  const round = rounds?.[0] ?? null;
  let questions: HostPlaySnapshot["questions"] = [];
  if (round) {
    const { data: questionRows } = await admin
      .from("questions")
      .select("id, position, prompt")
      .eq("round_id", round.id)
      .order("position", { ascending: true });
    questions = (questionRows ?? []).map((q) => ({
      id: q.id,
      position: q.position,
      prompt: q.prompt,
    }));
  }

  const currentQuestion =
    questions.find((q) => q.id === game?.current_question_id) ?? null;

  let submittedTeamIds: string[] = [];
  let submittedTeamNames: string[] = [];
  if (currentQuestion) {
    const { data: answers } = await admin
      .from("answers")
      .select("team_id")
      .eq("question_id", currentQuestion.id);

    submittedTeamIds = (answers ?? []).map((row) => row.team_id);
    if (submittedTeamIds.length > 0) {
      const { data: teamRows } = await admin
        .from("teams")
        .select("id, name")
        .in("id", submittedTeamIds);
      const nameById = new Map(
        (teamRows ?? []).map((team) => [team.id, team.name]),
      );
      submittedTeamNames = submittedTeamIds
        .map((id) => nameById.get(id))
        .filter((name): name is string => Boolean(name));
    }
  }

  return {
    status,
    round: round
      ? {
          id: round.id,
          title: round.title,
          plannedQuestionCount: round.planned_question_count,
        }
      : null,
    questions,
    currentQuestion,
    teamCount: teamCount ?? 0,
    submittedTeamIds,
    submittedTeamNames,
  };
}

export async function loadTeamPlaySnapshot(
  gameId: string,
  teamId: string,
  gameTitle: string,
  teamName: string,
): Promise<TeamPlaySnapshot> {
  const publicState = await loadPublicGameState(gameId);
  const admin = createAdminClient();

  let myAnswer: TeamPlaySnapshot["myAnswer"] = null;
  if (publicState.questionId) {
    const { data: answer } = await admin
      .from("answers")
      .select("answer_text, submitted_at")
      .eq("question_id", publicState.questionId)
      .eq("team_id", teamId)
      .maybeSingle();

    if (answer) {
      myAnswer = {
        text: answer.answer_text,
        submittedAt: answer.submitted_at,
      };
    }
  }

  return {
    status: publicState.status,
    gameTitle,
    teamName,
    publicState,
    myAnswer,
  };
}
