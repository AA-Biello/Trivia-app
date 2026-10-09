"use server";

import { revalidatePath } from "next/cache";

import { requireTeamSessionForGame } from "@/lib/auth/sessions";
import { isUniqueViolation } from "@/lib/game/db-errors";
import { broadcastAnswerProgress } from "@/lib/game/play-broadcast";
import {
  canSubmitAnswer,
  resolveSubmittingTeamId,
} from "@/lib/game/play-rules";
import { createAdminClient } from "@/lib/supabase/admin";
import type { GameStatus } from "@/types/game";

export type SubmitAnswerState = {
  error?: string;
  ok?: boolean;
  answerText?: string;
} | null;

export async function submitAnswerAction(
  _prev: SubmitAnswerState,
  formData: FormData,
): Promise<SubmitAnswerState> {
  const gameId = String(formData.get("gameId") ?? "");
  const questionId = String(formData.get("questionId") ?? "");
  const answerText = String(formData.get("answerText") ?? "").trim();

  if (!answerText) {
    return { error: "Enter an answer before locking in." };
  }
  if (answerText.length > 500) {
    return { error: "Keep your answer under 500 characters." };
  }

  let session;
  try {
    session = await requireTeamSessionForGame(gameId);
  } catch {
    return { error: "Team session invalid for this game." };
  }

  // Never trust a browser-supplied teamId — use cookie-resolved session only.
  const clientTeamId = String(formData.get("teamId") ?? "") || null;
  const teamId = resolveSubmittingTeamId(session.teamId, clientTeamId);

  const admin = createAdminClient();
  const { data: game } = await admin
    .from("games")
    .select("status, current_question_id")
    .eq("id", gameId)
    .single();

  if (!game || !canSubmitAnswer(game.status as GameStatus)) {
    return { error: "Submissions are closed for this question." };
  }
  if (!game.current_question_id || game.current_question_id !== questionId) {
    return { error: "That question is not open right now." };
  }

  const { data: question } = await admin
    .from("questions")
    .select("id, game_id")
    .eq("id", questionId)
    .eq("game_id", gameId)
    .maybeSingle();

  if (!question) {
    return { error: "Question not found." };
  }

  const { error: insertError } = await admin.from("answers").insert({
    game_id: gameId,
    question_id: questionId,
    team_id: teamId,
    answer_text: answerText,
    locked_at: new Date().toISOString(),
  });

  if (insertError) {
    if (isUniqueViolation(insertError)) {
      return { error: "Your team already locked in an answer." };
    }
    if (insertError.message?.includes("submissions not allowed")) {
      return { error: "Submissions are closed for this question." };
    }
    console.error("submitAnswer", insertError);
    return { error: "Could not submit your answer. Try again." };
  }

  const { count } = await admin
    .from("answers")
    .select("id", { count: "exact", head: true })
    .eq("question_id", questionId);

  try {
    await broadcastAnswerProgress(gameId, {
      questionId,
      submittedCount: count ?? 0,
      teamId,
      teamName: session.teamName,
    });
  } catch (error) {
    console.error("broadcastAnswerProgress", error);
  }

  revalidatePath(`/game/${gameId}`);
  revalidatePath(`/host/${gameId}`);
  return { ok: true, answerText };
}
