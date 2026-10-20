"use client";

import { useActionState, useEffect, useRef, useState } from "react";

import {
  submitAnswerAction,
  submitFinalResponseAction,
  type SubmitAnswerState,
  type SubmitFinalResponseState,
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
import { effectiveMaxWager } from "@/lib/game/wager-rules";
import { createClient } from "@/lib/supabase/client";

type Props = {
  gameId: string;
  initial: TeamPlaySnapshot;
};

const initialSubmit: SubmitAnswerState = null;
const initialFinal: SubmitFinalResponseState = null;

function snapshotSignature(snapshot: TeamPlaySnapshot): string {
  const state = snapshot.publicState;
  return [
    state.status,
    state.questionId ?? "",
    state.prompt ?? "",
    state.reveal?.correctAnswer ?? "",
    state.reveal?.teamAnswers?.length ?? 0,
    state.scoreboard?.length ?? 0,
    state.finalResults?.length ?? 0,
    snapshot.myAnswer?.submittedAt ?? "",
    snapshot.myWager?.amount ?? "",
    snapshot.myScore,
  ].join("|");
}

export function TeamPlayClient({ gameId, initial }: Props) {
  const [publicState, setPublicState] = useState(initial.publicState);
  const [myAnswer, setMyAnswer] = useState(initial.myAnswer);
  const [myWager, setMyWager] = useState(initial.myWager);
  const [myScore, setMyScore] = useState(initial.myScore);
  // Scope locks to a question so a prior submitState can't hide the next prompt.
  const [answerQuestionId, setAnswerQuestionId] = useState<string | null>(
    initial.myAnswer ? initial.publicState.questionId : null,
  );
  const [wagerQuestionId, setWagerQuestionId] = useState<string | null>(
    initial.myWager ? initial.publicState.questionId : null,
  );
  const questionIdRef = useRef(initial.publicState.questionId);
  const syncSignatureRef = useRef(snapshotSignature(initial));
  const [submitState, submitAction, pending] = useActionState(
    submitAnswerAction,
    initialSubmit,
  );
  const [finalState, finalAction, finalPending] = useActionState(
    submitFinalResponseAction,
    initialFinal,
  );

  const effectiveAnswer =
    myAnswer && answerQuestionId === publicState.questionId ? myAnswer : null;
  const effectiveWager =
    myWager && wagerQuestionId === publicState.questionId ? myWager : null;

  useEffect(() => {
    questionIdRef.current = publicState.questionId;
  }, [publicState.questionId]);

  function applySnapshot(snapshot: TeamPlaySnapshot) {
    const signature = snapshotSignature(snapshot);
    if (signature === syncSignatureRef.current) {
      return;
    }
    syncSignatureRef.current = signature;

    const next = snapshot.publicState;
    setPublicState(next);
    questionIdRef.current = next.questionId;
    setMyScore(snapshot.myScore);
    setMyAnswer(snapshot.myAnswer);
    setMyWager(snapshot.myWager);
    setAnswerQuestionId(
      snapshot.myAnswer ? next.questionId : null,
    );
    setWagerQuestionId(snapshot.myWager ? next.questionId : null);
  }

  function applyBroadcastState(state: PublicGameStatePayload) {
    const questionChanged = state.questionId !== questionIdRef.current;
    setPublicState(state);
    questionIdRef.current = state.questionId;
    if (questionChanged) {
      setMyAnswer(null);
      setMyWager(null);
      setAnswerQuestionId(null);
      setWagerQuestionId(null);
    }
    const scoreRow = state.scoreboard?.find(
      (row) => row.teamName === initial.teamName,
    );
    if (scoreRow) {
      setMyScore(scoreRow.totalPoints);
    }
    // Force the next poll/snapshot apply to accept fresher server data.
    syncSignatureRef.current = "";
  }

  // Capture optimistic lock-in for the submitted question only (not whatever is open now).
  useEffect(() => {
    if (!submitState?.ok || !submitState.answerText || !submitState.questionId) {
      return;
    }
    setMyAnswer({ text: submitState.answerText, submittedAt: "" });
    setAnswerQuestionId(submitState.questionId);
  }, [submitState]);

  useEffect(() => {
    if (!finalState?.ok || !finalState.questionId) return;
    if (finalState.answerText) {
      setMyAnswer({ text: finalState.answerText, submittedAt: "" });
      setAnswerQuestionId(finalState.questionId);
    }
    if (finalState.amount != null) {
      setMyWager({ amount: finalState.amount, lockedAt: "" });
      setWagerQuestionId(finalState.questionId);
    }
  }, [finalState]);

  // Apply server props only when the meaningful snapshot fingerprint changes.
  const initialSyncKey = snapshotSignature(initial);
  useEffect(() => {
    applySnapshot(initial);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- sync on fingerprint only
  }, [initialSyncKey]);

  // Realtime push (fast path) + HTTP poll fallback for mobile WS drops.
  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;

    async function pullSnapshot() {
      try {
        const response = await fetch(`/api/game/${gameId}/play`, {
          cache: "no-store",
          credentials: "same-origin",
        });
        if (!response.ok || cancelled) return;
        const snapshot = (await response.json()) as TeamPlaySnapshot;
        if (!snapshot?.publicState?.status || cancelled) return;
        applySnapshot(snapshot);
      } catch {
        // Ignore transient network errors; next poll retries.
      }
    }

    const channel = supabase
      .channel(playChannelName(gameId))
      .on("broadcast", { event: GAME_STATE_EVENT }, ({ payload }) => {
        const state = payload as PublicGameStatePayload;
        if (!state?.status) return;
        applyBroadcastState(state);
        // Immediately reconcile answer/wager fields from the server.
        void pullSnapshot();
      })
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          void pullSnapshot();
        }
      });

    const pollId = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        void pullSnapshot();
      }
    }, 2000);

    const onVisible = () => {
      if (document.visibilityState === "visible") {
        void pullSnapshot();
      }
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      cancelled = true;
      window.clearInterval(pollId);
      document.removeEventListener("visibilitychange", onVisible);
      void supabase.removeChannel(channel);
    };
  }, [gameId, initial.teamName]);

  const phase = resolveTeamPlayPhase({
    status: publicState.status,
    hasAnswer: Boolean(effectiveAnswer),
    hasWager: Boolean(effectiveWager),
  });

  const reveal = publicState.reveal;
  const configuredMaxWager = publicState.maxWager ?? 0;
  const teamEffectiveMax = effectiveMaxWager(configuredMaxWager, myScore);

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

      {phase === "round_break" || phase === "round_review" ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-6 py-10 text-center">
          <p className="text-xl font-medium text-amber-950">
            The host is reviewing your answers
          </p>
          <p className="mt-2 text-amber-900/80">
            Hang tight — results will appear when the host starts the reveal.
          </p>
        </div>
      ) : null}

      {phase === "reveal" && reveal ? (
        <div className="flex flex-col gap-4 rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
          <p className="text-sm font-medium text-zinc-500">
            {formatQuestionProgress(
              reveal.questionNumber,
              reveal.questionCount,
            )}
          </p>
          <p className="text-xl font-semibold text-zinc-900">{reveal.prompt}</p>

          {reveal.correctAnswer != null ? (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3">
              <p className="text-xs font-medium uppercase tracking-wide text-emerald-800">
                Correct answer
              </p>
              <p className="mt-1 text-lg font-semibold text-emerald-950">
                {reveal.correctAnswer}
              </p>
            </div>
          ) : (
            <p className="text-sm text-zinc-500">
              Waiting for the host to reveal the correct answer…
            </p>
          )}

          {reveal.teamAnswers ? (
            <ul className="divide-y divide-zinc-200 rounded-lg border border-zinc-200">
              {reveal.teamAnswers.map((row) => (
                <li
                  key={`${row.teamName}-${row.answerText}`}
                  className="flex items-start justify-between gap-3 px-4 py-3"
                >
                  <div>
                    <p className="font-medium text-zinc-900">{row.teamName}</p>
                    <p className="whitespace-pre-wrap text-zinc-700">
                      {row.answerText}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 text-lg font-semibold ${
                      row.isCorrect ? "text-emerald-700" : "text-zinc-500"
                    }`}
                    aria-label={row.isCorrect ? "Correct" : "Incorrect"}
                  >
                    {row.isCorrect ? "✓" : "✕"}
                  </span>
                </li>
              ))}
            </ul>
          ) : reveal.correctAnswer != null ? (
            <p className="text-sm text-zinc-500">
              Waiting for the host to reveal team answers…
            </p>
          ) : null}
        </div>
      ) : null}

      {phase === "reveal" && !reveal ? (
        <div className="rounded-xl border border-zinc-200 bg-white px-6 py-8 text-center text-zinc-600">
          Waiting for the host to reveal…
        </div>
      ) : null}

      {phase === "awaiting_scoreboard" ? (
        <div className="rounded-xl border border-zinc-200 bg-white px-6 py-10 text-center">
          <p className="text-xl font-medium text-zinc-900">Reveal complete</p>
          <p className="mt-2 text-zinc-600">
            Waiting for the host to publish the scoreboard…
          </p>
        </div>
      ) : null}

      {phase === "scoreboard" ? (
        <div className="flex flex-col gap-4 rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-zinc-900">Scoreboard</h2>
          {publicState.scoreboard && publicState.scoreboard.length > 0 ? (
            <ol className="divide-y divide-zinc-200 rounded-lg border border-zinc-200">
              {publicState.scoreboard.map((row) => (
                <li
                  key={`${row.rank}-${row.teamName}`}
                  className="flex items-center justify-between px-4 py-3"
                >
                  <div>
                    <span className="mr-3 font-mono text-sm text-zinc-500">
                      #{row.rank}
                    </span>
                    <span className="font-medium text-zinc-900">
                      {row.teamName}
                    </span>
                  </div>
                  <div className="text-right text-sm">
                    <p className="font-semibold text-zinc-900">
                      {row.totalPoints} total
                    </p>
                    <p className="text-zinc-500">
                      {row.roundPoints} this round
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-sm text-zinc-600">Scores coming soon…</p>
          )}
          <p className="text-sm text-zinc-500">
            Waiting for the host to start the next round or final wager…
          </p>
        </div>
      ) : null}

      {phase === "final_question_unanswered" && publicState.questionId ? (
        <div className="flex flex-col gap-4 rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
          <p className="text-sm font-medium text-zinc-500">Final question</p>
          <p className="text-xl font-semibold text-zinc-900">
            {publicState.prompt}
          </p>
          <p className="text-sm text-zinc-600">
            Current score:{" "}
            <span className="font-semibold text-zinc-900">{myScore}</span>
            {" · "}
            Max wager:{" "}
            <span className="font-semibold text-zinc-900">{teamEffectiveMax}</span>
            {configuredMaxWager !== teamEffectiveMax ? (
              <span className="text-zinc-500">
                {" "}
                (host max {configuredMaxWager})
              </span>
            ) : null}
          </p>
          <form action={finalAction} className="flex flex-col gap-3">
            <input type="hidden" name="gameId" value={gameId} />
            <input
              type="hidden"
              name="questionId"
              value={publicState.questionId}
            />
            <label className="flex flex-col gap-1 text-sm font-medium text-zinc-800">
              Answer
              <textarea
                name="answerText"
                required
                rows={4}
                maxLength={500}
                className="rounded-lg border border-zinc-300 px-3 py-2 text-base"
                placeholder="Type your final answer"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm font-medium text-zinc-800">
              Wager
              <input
                name="amount"
                type="number"
                min={0}
                max={teamEffectiveMax}
                step={1}
                required
                className="rounded-lg border border-zinc-300 px-3 py-2"
                placeholder="0"
              />
            </label>
            {finalState?.error ? (
              <p className="text-sm text-red-700" role="alert">
                {finalState.error}
              </p>
            ) : null}
            <button
              type="submit"
              disabled={finalPending}
              className="rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
            >
              {finalPending ? "Locking…" : "Lock answer & wager"}
            </button>
          </form>
        </div>
      ) : null}

      {phase === "final_question_answered" ? (
        <div className="flex flex-col gap-3 rounded-xl border border-emerald-200 bg-emerald-50/60 px-5 py-6">
          <p className="text-sm font-medium text-emerald-900">Final question</p>
          <p className="font-semibold text-zinc-900">{publicState.prompt}</p>
          <div className="rounded-lg bg-white px-4 py-3 text-zinc-800">
            <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
              Your answer
            </p>
            <p className="mt-1 whitespace-pre-wrap">{effectiveAnswer?.text}</p>
          </div>
          <div className="rounded-lg bg-white px-4 py-3 text-zinc-800">
            <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
              Your wager
            </p>
            <p className="mt-1 text-lg font-semibold">
              {effectiveWager?.amount ?? 0}
            </p>
          </div>
          <p className="text-lg font-semibold text-emerald-900">
            Final answer locked
          </p>
          <p className="text-zinc-600">Waiting for the host…</p>
        </div>
      ) : null}

      {phase === "final_review" ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-6 py-10 text-center">
          <p className="text-xl font-medium text-amber-950">
            The host is grading final answers
          </p>
          <p className="mt-2 text-amber-900/80">
            Results stay hidden until the host publishes standings.
          </p>
        </div>
      ) : null}

      {phase === "final_results" ? (
        <div className="flex flex-col gap-4 rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-zinc-900">Final standings</h2>
          {publicState.finalResults && publicState.finalResults.length > 0 ? (
            <ol className="divide-y divide-zinc-200 rounded-lg border border-zinc-200">
              {publicState.finalResults.map((row) => (
                <li
                  key={`${row.rank}-${row.teamName}`}
                  className="flex flex-col gap-1 px-4 py-3"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="mr-3 font-mono text-sm text-zinc-500">
                        #{row.rank}
                      </span>
                      <span className="font-medium text-zinc-900">
                        {row.teamName}
                      </span>
                    </div>
                    <span className="text-lg font-semibold text-zinc-900">
                      {row.finalScore}
                    </span>
                  </div>
                  <p className="text-sm text-zinc-600">
                    Start {row.startingScore} · Wager {row.wager} ·{" "}
                    {row.isCorrect ? "Correct ✓" : "Incorrect ✕"}
                  </p>
                  <p className="whitespace-pre-wrap text-sm text-zinc-700">
                    {row.answerText ?? "(no answer)"}
                  </p>
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-sm text-zinc-600">Standings coming soon…</p>
          )}
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
