"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import {
  submitAnswerAction,
  type SubmitAnswerState,
} from "@/app/actions/team-play";
import {
  GAME_STATE_EVENT,
  playChannelName,
  type PublicGameStatePayload,
} from "@/lib/game/play-channel";
import {
  formatQuestionProgress,
  resolveTeamPlayPhase,
} from "@/lib/game/play-rules";
import type { TeamPlaySnapshot } from "@/lib/game/play-state";
import { createClient } from "@/lib/supabase/client";

type Props = {
  gameId: string;
  initial: TeamPlaySnapshot;
};

const initialSubmit: SubmitAnswerState = null;

export function TeamPlayClient({ gameId, initial }: Props) {
  const router = useRouter();
  const [publicState, setPublicState] = useState(initial.publicState);
  const [myAnswer, setMyAnswer] = useState(initial.myAnswer);
  const questionIdRef = useRef(initial.publicState.questionId);
  const [submitState, submitAction, pending] = useActionState(
    submitAnswerAction,
    initialSubmit,
  );

  const effectiveAnswer =
    myAnswer ??
    (submitState?.ok && submitState.answerText
      ? { text: submitState.answerText, submittedAt: "" }
      : null);

  useEffect(() => {
    questionIdRef.current = publicState.questionId;
  }, [publicState.questionId]);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(playChannelName(gameId))
      .on("broadcast", { event: GAME_STATE_EVENT }, ({ payload }) => {
        const state = payload as PublicGameStatePayload;
        if (!state?.status) return;
        const questionChanged = state.questionId !== questionIdRef.current;
        setPublicState(state);
        if (questionChanged) {
          setMyAnswer(null);
        }
        router.refresh();
      })
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [gameId, router]);

  const phase = resolveTeamPlayPhase({
    status: publicState.status,
    hasAnswer: Boolean(effectiveAnswer),
  });

  return (
    <main className="mx-auto flex w-full max-w-lg flex-1 flex-col gap-8 px-6 py-16">
      <div className="flex flex-col gap-2">
        <p className="text-sm font-medium uppercase tracking-wide text-amber-800">
          {initial.teamName}
        </p>
        <h1 className="text-3xl font-semibold tracking-tight text-zinc-900">
          {initial.gameTitle}
        </h1>
        {publicState.roundTitle ? (
          <p className="text-zinc-600">{publicState.roundTitle}</p>
        ) : null}
      </div>

      {phase === "lobby" ? (
        <div className="rounded-xl border border-zinc-200 bg-white px-6 py-10 text-center shadow-sm">
          <p className="text-xl font-medium text-zinc-900">
            Waiting for trivia to begin
          </p>
          <p className="mt-2 text-zinc-600">
            Hang tight — the host will open the first question soon.
          </p>
        </div>
      ) : null}

      {phase === "question_open_unanswered" && publicState.questionId ? (
        <div className="flex flex-col gap-4 rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
          <p className="text-sm font-medium text-zinc-500">
            {publicState.questionNumber != null &&
            publicState.questionCount != null
              ? formatQuestionProgress(
                  publicState.questionNumber,
                  publicState.questionCount,
                )
              : null}
          </p>
          <p className="text-xl font-semibold text-zinc-900">
            {publicState.prompt}
          </p>
          <form action={submitAction} className="flex flex-col gap-3">
            <input type="hidden" name="gameId" value={gameId} />
            <input
              type="hidden"
              name="questionId"
              value={publicState.questionId}
            />
            <label className="flex flex-col gap-1 text-sm font-medium text-zinc-800">
              Your answer
              <textarea
                name="answerText"
                required
                rows={4}
                maxLength={500}
                className="rounded-lg border border-zinc-300 px-3 py-2 text-base"
                placeholder="Type your team’s answer"
              />
            </label>
            {submitState?.error ? (
              <p className="text-sm text-red-700" role="alert">
                {submitState.error}
              </p>
            ) : null}
            <button
              type="submit"
              disabled={pending}
              className="rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
            >
              {pending ? "Locking in…" : "Lock in answer"}
            </button>
          </form>
        </div>
      ) : null}

      {phase === "question_open_answered" ||
      phase === "question_closed_answered" ? (
        <div className="flex flex-col gap-3 rounded-xl border border-emerald-200 bg-emerald-50/60 px-5 py-6">
          <p className="text-sm font-medium text-emerald-900">
            {publicState.questionNumber != null &&
            publicState.questionCount != null
              ? formatQuestionProgress(
                  publicState.questionNumber,
                  publicState.questionCount,
                )
              : null}
          </p>
          <p className="font-semibold text-zinc-900">{publicState.prompt}</p>
          <div className="rounded-lg bg-white px-4 py-3 text-zinc-800">
            <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
              Your answer
            </p>
            <p className="mt-1 whitespace-pre-wrap">{effectiveAnswer?.text}</p>
          </div>
          <p className="text-lg font-semibold text-emerald-900">
            Answer locked in
          </p>
          <p className="text-zinc-600">Waiting for the next question</p>
        </div>
      ) : null}

      {phase === "question_closed_unanswered" ? (
        <div className="rounded-xl border border-zinc-200 bg-white px-6 py-10 text-center">
          <p className="text-xl font-medium text-zinc-900">Time is up</p>
          <p className="mt-2 text-zinc-600">
            The host closed this question before your team answered.
          </p>
        </div>
      ) : null}

      {phase === "round_break" ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-6 py-10 text-center">
          <p className="text-xl font-medium text-amber-950">Round complete</p>
          <p className="mt-2 text-amber-900/80">
            The host is reviewing answers
          </p>
        </div>
      ) : null}

      {phase === "other" ? (
        <div className="rounded-xl border border-zinc-200 bg-white px-6 py-8 text-center text-zinc-600">
          Waiting for the host…
        </div>
      ) : null}
    </main>
  );
}
