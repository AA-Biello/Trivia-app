"use server";

import { revalidatePath } from "next/cache";

import { requireTeamSessionForGame } from "@/lib/auth/sessions";
import { isUniqueViolation } from "@/lib/game/db-errors";
import {
  broadcastAnswerProgress,
  broadcastWagerProgress,
} from "@/lib/game/play-broadcast";
import {
  canSubmitAnswer,
  resolveSubmittingTeamId,
} from "@/lib/game/play-rules";
import {
  canSubmitFinalResponse,
  parseWagerAmount,
  validateWager,
} from "@/lib/game/wager-rules";
import { createAdminClient } from "@/lib/supabase/admin";
import type { GameStatus } from "@/types/game";

export type SubmitAnswerState = {
  error?: string;
  ok?: boolean;
  answerText?: string;
  updated?: boolean;
} | null;

export type SubmitFinalResponseState = {
  error?: string;
  ok?: boolean;
  answerText?: string;
  amount?: number;
  updated?: boolean;
} | null;

export async function submitAnswerAction(
  _prev: SubmitAnswerState,
  formData: FormData,
): Promise<SubmitAnswerState> {
  const gameId = String(formData.get("gameId") ?? "");
  const questionId = String(formData.get("questionId") ?? "");
  const answerText = String(formData.get("answerText") ?? "").trim();

  if (!answerText) {
    return { error: "Enter an answer before submitting." };
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

  const { data: existing } = await admin
    .from("answers")
    .select("id, locked_at")
    .eq("question_id", questionId)
    .eq("team_id", teamId)
    .maybeSingle();

  if (existing?.locked_at) {
    return { error: "This answer is locked and can no longer be changed." };
  }

  let updated = false;
  if (existing) {
    const { error: updateError } = await admin
      .from("answers")
      .update({ answer_text: answerText })
      .eq("id", existing.id);
    if (updateError) {
      if (updateError.message?.includes("locked")) {
        return { error: "This answer is locked and can no longer be changed." };
      }
      console.error("submitAnswer update", updateError);
      return { error: "Could not update your answer. Try again." };
    }
    updated = true;
  } else {
    const { error: insertError } = await admin.from("answers").insert({
      game_id: gameId,
      question_id: questionId,
      team_id: teamId,
      answer_text: answerText,
      locked_at: null,
    });

    if (insertError) {
      if (isUniqueViolation(insertError)) {
        // Race: retry as update.
        const { error: retryError } = await admin
          .from("answers")
          .update({ answer_text: answerText })
          .eq("question_id", questionId)
          .eq("team_id", teamId)
          .is("locked_at", null);
        if (retryError) {
          return { error: "Could not save your answer. Try again." };
        }
        updated = true;
      } else if (insertError.message?.includes("submissions not allowed")) {
        return { error: "Submissions are closed for this question." };
      } else {
        console.error("submitAnswer insert", insertError);
        return { error: "Could not submit your answer. Try again." };
      }
    }
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
  return { ok: true, answerText, updated };
}

/**
 * Submit or update final answer + wager while FINAL_QUESTION is open.
 * Remains editable until the host closes into FINAL_REVIEW.
 */
export async function submitFinalResponseAction(
  _prev: SubmitFinalResponseState,
  formData: FormData,
): Promise<SubmitFinalResponseState> {
  const gameId = String(formData.get("gameId") ?? "");
  const questionId = String(formData.get("questionId") ?? "");
  const answerText = String(formData.get("answerText") ?? "").trim();
  const amount = parseWagerAmount(formData.get("amount"));

  if (!answerText) {
    return { error: "Enter an answer before submitting." };
  }
  if (answerText.length > 500) {
    return { error: "Keep your answer under 500 characters." };
  }
  if (amount == null) {
    return { error: "Enter a whole-number wager." };
  }

  let session;
  try {
    session = await requireTeamSessionForGame(gameId);
  } catch {
    return { error: "Team session invalid for this game." };
  }

  const clientTeamId = String(formData.get("teamId") ?? "") || null;
  const teamId = resolveSubmittingTeamId(session.teamId, clientTeamId);

  const admin = createAdminClient();
  const { data: game } = await admin
    .from("games")
    .select("status, current_question_id, current_round_id")
    .eq("id", gameId)
    .single();

  if (!game || !canSubmitFinalResponse(game.status as GameStatus)) {
    return { error: "Final responses are closed." };
  }
  if (!game.current_question_id || game.current_question_id !== questionId) {
    return { error: "That final question is not open right now." };
  }

  const { data: round } = await admin
    .from("rounds")
    .select("max_wager")
    .eq("id", game.current_round_id ?? "")
    .maybeSingle();

  const { data: team } = await admin
    .from("teams")
    .select("display_score")
    .eq("id", teamId)
    .maybeSingle();

  const validation = validateWager({
    amount,
    maxWager: round?.max_wager ?? -1,
    currentScore: team?.display_score ?? 0,
  });
  if (!validation.ok) {
    return { error: validation.error };
  }

  const [{ data: existingAnswer }, { data: existingWager }] = await Promise.all([
    admin
      .from("answers")
      .select("id, locked_at")
      .eq("question_id", questionId)
      .eq("team_id", teamId)
      .maybeSingle(),
    admin
      .from("wagers")
      .select("id, locked_at")
      .eq("question_id", questionId)
      .eq("team_id", teamId)
      .maybeSingle(),
  ]);

  if (existingAnswer?.locked_at || existingWager?.locked_at) {
    return { error: "Your final response is locked and can no longer be changed." };
  }

  const updated = Boolean(existingAnswer || existingWager);

  if (existingWager) {
    const { error: wagerError } = await admin
      .from("wagers")
      .update({ amount: validation.amount })
      .eq("id", existingWager.id);
    if (wagerError) {
      console.error("submitFinalResponse wager update", wagerError);
      return { error: "Could not update your wager. Try again." };
    }
  } else {
    const { error: wagerError } = await admin.from("wagers").insert({
      game_id: gameId,
      question_id: questionId,
      team_id: teamId,
      amount: validation.amount,
      locked_at: null,
    });
    if (wagerError) {
      if (isUniqueViolation(wagerError)) {
        const { error: retry } = await admin
          .from("wagers")
          .update({ amount: validation.amount })
          .eq("question_id", questionId)
          .eq("team_id", teamId)
          .is("locked_at", null);
        if (retry) {
          return { error: "Could not save your wager. Try again." };
        }
      } else if (
        wagerError.message?.includes("FINAL_QUESTION") ||
        wagerError.message?.includes("WAGER_OPEN")
      ) {
        return { error: "Final responses are closed." };
      } else {
        console.error("submitFinalResponse wager insert", wagerError);
        return { error: "Could not save your final response. Try again." };
      }
    }
  }

  if (existingAnswer) {
    const { error: answerError } = await admin
      .from("answers")
      .update({ answer_text: answerText })
      .eq("id", existingAnswer.id);
    if (answerError) {
      console.error("submitFinalResponse answer update", answerError);
      return { error: "Could not update your answer. Try again." };
    }
  } else {
    const { error: answerError } = await admin.from("answers").insert({
      game_id: gameId,
      question_id: questionId,
      team_id: teamId,
      answer_text: answerText,
      locked_at: null,
    });
    if (answerError) {
      if (isUniqueViolation(answerError)) {
        const { error: retry } = await admin
          .from("answers")
          .update({ answer_text: answerText })
          .eq("question_id", questionId)
          .eq("team_id", teamId)
          .is("locked_at", null);
        if (retry) {
          return { error: "Could not save your answer. Try again." };
        }
      } else {
        console.error("submitFinalResponse answer insert", answerError);
        return { error: "Could not save your final response. Try again." };
      }
    }
  }

  const [{ count: answerCount }, { count: wagerCount }] = await Promise.all([
    admin
      .from("answers")
      .select("id", { count: "exact", head: true })
      .eq("question_id", questionId),
    admin
      .from("wagers")
      .select("id", { count: "exact", head: true })
      .eq("question_id", questionId),
  ]);

  const submittedCount = Math.min(answerCount ?? 0, wagerCount ?? 0);

  try {
    await broadcastWagerProgress(gameId, {
      questionId,
      wageredCount: submittedCount,
      teamId,
      teamName: session.teamName,
    });
    await broadcastAnswerProgress(gameId, {
      questionId,
      submittedCount,
      teamId,
      teamName: session.teamName,
    });
  } catch (error) {
    console.error("broadcast final progress", error);
  }

  revalidatePath(`/game/${gameId}`);
  revalidatePath(`/host/${gameId}`);
  return { ok: true, answerText, amount: validation.amount, updated };
}
