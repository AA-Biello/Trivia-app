import "server-only";

import { loadPublishedFinalResults } from "@/lib/game/final-state";
import { buildPublicRevealForGame } from "@/lib/game/grade-state";
import type { PublicGameStatePayload } from "@/lib/game/play-channel";
import { loadPublishedScoreboard } from "@/lib/game/scoreboard-state";
import { publicWaitingMessageForStatus } from "@/lib/game/waiting-message";
import { createAdminClient } from "@/lib/supabase/admin";
import type { GameStatus } from "@/types/game";

export type HostPlaySnapshot = {
  status: GameStatus;
  round: {
    id: string;
    title: string;
    kind: string;
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
  myWager: { amount: number; lockedAt: string | null } | null;
  myScore: number;
};

function emptyPublicState(status: GameStatus = "LOBBY"): PublicGameStatePayload {
  return {
    status,
    roundId: null,
    roundTitle: null,
    questionId: null,
    questionNumber: null,
    questionCount: null,
    prompt: null,
    maxWager: null,
    waitingMessage: null,
    reveal: null,
    scoreboard: null,
    finalResults: null,
  };
}

export async function loadPublicGameState(
  gameId: string,
): Promise<PublicGameStatePayload> {
  const admin = createAdminClient();

  const { data: game } = await admin
    .from("games")
    .select("status, current_round_id, current_question_id, waiting_message")
    .eq("id", gameId)
    .single();

  if (!game) {
    return emptyPublicState();
  }

  const status = game.status as GameStatus;
  const waitingMessage = publicWaitingMessageForStatus(
    status,
    game.waiting_message,
  );

  let roundTitle: string | null = null;
  let questionCount: number | null = null;
  let maxWager: number | null = null;
  if (game.current_round_id) {
    const { data: round } = await admin
      .from("rounds")
      .select("title, planned_question_count, max_wager, kind")
      .eq("id", game.current_round_id)
      .maybeSingle();
    roundTitle = round?.title ?? null;
    if (round?.kind === "final" || round?.kind === "wager") {
      maxWager = round.max_wager;
    }

    const { count: actualCount } = await admin
      .from("questions")
      .select("id", { count: "exact", head: true })
      .eq("round_id", game.current_round_id);

    questionCount =
      actualCount && actualCount > 0
        ? actualCount
        : (round?.planned_question_count ?? null);
  }

  // During review / wager wait, teams only get safe status fields.
  if (
    status === "ROUND_REVIEW" ||
    status === "ROUND_BREAK" ||
    status === "FINAL_REVIEW"
  ) {
    return {
      ...emptyPublicState(status),
      roundId: game.current_round_id,
      roundTitle,
      questionCount,
      maxWager: status === "FINAL_REVIEW" ? maxWager : null,
      waitingMessage,
    };
  }

  let questionNumber: number | null = null;
  let prompt: string | null = null;
  let questionId: string | null = game.current_question_id;

  if (
    (status === "QUESTION_OPEN" ||
      status === "QUESTION_CLOSED" ||
      status === "FINAL_QUESTION") &&
    game.current_question_id
  ) {
    const { data: question } = await admin
      .from("questions")
      .select("position, prompt")
      .eq("id", game.current_question_id)
      .maybeSingle();
    questionNumber = question?.position ?? null;
    prompt = question?.prompt ?? null;
  } else if (status !== "REVEAL") {
    questionId = null;
  }

  const reveal =
    status === "REVEAL" ? await buildPublicRevealForGame(gameId) : null;

  const scoreboard =
    status === "SCOREBOARD"
      ? await loadPublishedScoreboard(gameId, game.current_round_id)
      : null;

  const finalResults =
    status === "FINAL_RESULTS" || status === "GAME_OVER"
      ? await loadPublishedFinalResults(gameId)
      : null;

  return {
    status,
    roundId: game.current_round_id,
    roundTitle,
    questionId: status === "REVEAL" ? (reveal?.questionId ?? null) : questionId,
    questionNumber:
      status === "REVEAL" ? (reveal?.questionNumber ?? null) : questionNumber,
    questionCount:
      status === "REVEAL" ? (reveal?.questionCount ?? questionCount) : questionCount,
    prompt: status === "REVEAL" ? (reveal?.prompt ?? null) : prompt,
    maxWager: status === "FINAL_QUESTION" ? maxWager : null,
    waitingMessage: null,
    reveal,
    scoreboard,
    finalResults,
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

  // Prefer the current round; fall back to the first round for lobby setup.
  let round: {
    id: string;
    title: string;
    kind: string;
    planned_question_count: number;
  } | null = null;

  if (game?.current_round_id) {
    const { data } = await admin
      .from("rounds")
      .select("id, title, kind, planned_question_count")
      .eq("id", game.current_round_id)
      .maybeSingle();
    round = data;
  }

  if (!round) {
    const { data: rounds } = await admin
      .from("rounds")
      .select("id, title, kind, planned_question_count, position")
      .eq("game_id", gameId)
      .order("position", { ascending: true })
      .limit(1);
    round = rounds?.[0] ?? null;
  }

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
  if (game?.current_question_id) {
    const { data: answers } = await admin
      .from("answers")
      .select("team_id")
      .eq("question_id", game.current_question_id);

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
          kind: round.kind,
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

  const { data: team } = await admin
    .from("teams")
    .select("display_score")
    .eq("id", teamId)
    .maybeSingle();

  let myAnswer: TeamPlaySnapshot["myAnswer"] = null;
  const answerQuestionId =
    publicState.status === "QUESTION_OPEN" ||
    publicState.status === "QUESTION_CLOSED" ||
    publicState.status === "FINAL_QUESTION"
      ? publicState.questionId
      : null;

  if (answerQuestionId) {
    const { data: answer } = await admin
      .from("answers")
      .select("answer_text, submitted_at")
      .eq("question_id", answerQuestionId)
      .eq("team_id", teamId)
      .maybeSingle();

    if (answer) {
      myAnswer = {
        text: answer.answer_text,
        submittedAt: answer.submitted_at,
      };
    }
  }

  let myWager: TeamPlaySnapshot["myWager"] = null;
  if (
    publicState.questionId &&
    (publicState.status === "FINAL_QUESTION" ||
      publicState.status === "FINAL_REVIEW")
  ) {
    const { data: wager } = await admin
      .from("wagers")
      .select("amount, locked_at")
      .eq("question_id", publicState.questionId)
      .eq("team_id", teamId)
      .maybeSingle();
    if (wager) {
      myWager = { amount: wager.amount, lockedAt: wager.locked_at };
    }
  }

  return {
    status: publicState.status,
    gameTitle,
    teamName,
    publicState,
    myAnswer,
    myWager,
    myScore: team?.display_score ?? 0,
  };
}
