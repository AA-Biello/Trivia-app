import "server-only";

import type { PublicRevealView } from "@/lib/game/play-channel";
import {
  buildPublicRevealView,
  type HostGradeQuestionView,
  type HostRevealSnapshot,
} from "@/lib/game/scoring";
import { createAdminClient } from "@/lib/supabase/admin";

export type { HostGradeQuestionView, HostRevealSnapshot };

export async function loadHostGradingQuestions(
  gameId: string,
  roundId: string,
): Promise<HostGradeQuestionView[]> {
  const admin = createAdminClient();

  const { data: questions } = await admin
    .from("questions")
    .select("id, position, prompt, point_value")
    .eq("round_id", roundId)
    .order("position", { ascending: true });

  const { data: teams } = await admin
    .from("teams")
    .select("id, name")
    .eq("game_id", gameId)
    .order("created_at", { ascending: true });

  const teamList = teams ?? [];
  const questionList = questions ?? [];
  if (questionList.length === 0) {
    return [];
  }

  const questionIds = questionList.map((q) => q.id);

  const [{ data: secrets }, { data: answers }] = await Promise.all([
    admin
      .from("question_secrets")
      .select("question_id, correct_answer")
      .in("question_id", questionIds),
    admin
      .from("answers")
      .select("id, question_id, team_id, answer_text")
      .in("question_id", questionIds),
  ]);

  const answerIds = (answers ?? []).map((a) => a.id);
  const { data: grades } =
    answerIds.length > 0
      ? await admin
          .from("answer_grades")
          .select("answer_id, is_correct, points_awarded, graded_at")
          .in("answer_id", answerIds)
      : { data: [] };

  const secretByQ = new Map(
    (secrets ?? []).map((s) => [s.question_id, s.correct_answer]),
  );
  const gradeByAnswer = new Map(
    (grades ?? []).map((g) => [g.answer_id, g]),
  );
  const teamName = new Map(teamList.map((t) => [t.id, t.name]));

  return questionList.map((question) => {
    const qAnswers = (answers ?? []).filter(
      (a) => a.question_id === question.id,
    );
    const answeredTeamIds = new Set(qAnswers.map((a) => a.team_id));

    return {
      id: question.id,
      position: question.position,
      prompt: question.prompt,
      pointValue: question.point_value,
      correctAnswer: secretByQ.get(question.id) ?? "",
      answers: qAnswers.map((a) => {
        const grade = gradeByAnswer.get(a.id);
        return {
          answerId: a.id,
          teamId: a.team_id,
          teamName: teamName.get(a.team_id) ?? "Unknown team",
          answerText: a.answer_text,
          isCorrect: grade?.is_correct ?? null,
          pointsAwarded: grade?.points_awarded ?? null,
          gradedAt: grade?.graded_at ?? null,
        };
      }),
      unansweredTeams: teamList
        .filter((t) => !answeredTeamIds.has(t.id))
        .map((t) => ({ teamId: t.id, teamName: t.name })),
    };
  });
}

export async function loadHostRevealSnapshot(
  gameId: string,
): Promise<HostRevealSnapshot | null> {
  const admin = createAdminClient();
  const { data: reveal } = await admin
    .from("game_reveal_state")
    .select(
      "round_id, current_question_id, correct_answer_revealed, team_answers_revealed",
    )
    .eq("game_id", gameId)
    .maybeSingle();

  if (!reveal) {
    return null;
  }

  const { count } = await admin
    .from("questions")
    .select("id", { count: "exact", head: true })
    .eq("round_id", reveal.round_id);

  let questionNumber: number | null = null;
  let prompt: string | null = null;
  let correctAnswer: string | null = null;

  if (reveal.current_question_id) {
    const { data: question } = await admin
      .from("questions")
      .select("position, prompt")
      .eq("id", reveal.current_question_id)
      .maybeSingle();
    questionNumber = question?.position ?? null;
    prompt = question?.prompt ?? null;

    const { data: secret } = await admin
      .from("question_secrets")
      .select("correct_answer")
      .eq("question_id", reveal.current_question_id)
      .maybeSingle();
    correctAnswer = secret?.correct_answer ?? null;
  }

  return {
    roundId: reveal.round_id,
    questionId: reveal.current_question_id,
    questionNumber,
    questionCount: count ?? 0,
    prompt,
    correctAnswer,
    correctAnswerRevealed: reveal.correct_answer_revealed,
    teamAnswersRevealed: reveal.team_answers_revealed,
  };
}

export async function buildPublicRevealForGame(
  gameId: string,
): Promise<PublicRevealView | null> {
  const admin = createAdminClient();
  const { data: game } = await admin
    .from("games")
    .select("status")
    .eq("id", gameId)
    .maybeSingle();

  if (!game || game.status !== "REVEAL") {
    return null;
  }

  const { data: reveal } = await admin
    .from("game_reveal_state")
    .select(
      "round_id, current_question_id, correct_answer_revealed, team_answers_revealed",
    )
    .eq("game_id", gameId)
    .maybeSingle();

  if (!reveal?.current_question_id) {
    return null;
  }

  const { data: question } = await admin
    .from("questions")
    .select("position, prompt")
    .eq("id", reveal.current_question_id)
    .single();

  if (!question) {
    return null;
  }

  const { count } = await admin
    .from("questions")
    .select("id", { count: "exact", head: true })
    .eq("round_id", reveal.round_id);

  const { data: secret } = await admin
    .from("question_secrets")
    .select("correct_answer")
    .eq("question_id", reveal.current_question_id)
    .maybeSingle();

  let teamAnswers: PublicRevealView["teamAnswers"] = [];
  if (reveal.team_answers_revealed) {
    const { data: answers } = await admin
      .from("answers")
      .select("id, team_id, answer_text")
      .eq("question_id", reveal.current_question_id);

    const answerRows = answers ?? [];
    const teamIds = answerRows.map((a) => a.team_id);
    const answerIds = answerRows.map((a) => a.id);

    const [{ data: teams }, { data: grades }] = await Promise.all([
      teamIds.length
        ? admin.from("teams").select("id, name").in("id", teamIds)
        : Promise.resolve({ data: [] }),
      answerIds.length
        ? admin
            .from("answer_grades")
            .select("answer_id, is_correct, points_awarded")
            .in("answer_id", answerIds)
        : Promise.resolve({ data: [] }),
    ]);

    const nameById = new Map((teams ?? []).map((t) => [t.id, t.name]));
    const gradeById = new Map((grades ?? []).map((g) => [g.answer_id, g]));

    teamAnswers = answerRows
      .map((a) => {
        const grade = gradeById.get(a.id);
        return {
          teamName: nameById.get(a.team_id) ?? "Unknown team",
          answerText: a.answer_text,
          isCorrect: grade?.is_correct ?? null,
          pointsAwarded: grade?.points_awarded ?? 0,
        };
      })
      .sort((a, b) => a.teamName.localeCompare(b.teamName));
  }

  return buildPublicRevealView({
    questionId: reveal.current_question_id,
    questionNumber: question.position,
    questionCount: count ?? 0,
    prompt: question.prompt,
    correctAnswer: secret?.correct_answer ?? "",
    correctAnswerRevealed: reveal.correct_answer_revealed,
    teamAnswersRevealed: reveal.team_answers_revealed,
    teamAnswers: teamAnswers ?? [],
  });
}
