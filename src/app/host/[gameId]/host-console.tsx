"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import {
  advanceOrEndRoundAction,
  closeQuestionAction,
  openQuestionAction,
  type HostPlayActionState,
} from "@/app/actions/host-play";
import { HostFinalPanel } from "@/app/host/[gameId]/host-final-panel";
import { HostGradingPanel } from "@/app/host/[gameId]/host-grading-panel";
import { HostRevealPanel } from "@/app/host/[gameId]/host-reveal-panel";
import { HostRoundList } from "@/app/host/[gameId]/host-round-list";
import { HostRunningScoreboard } from "@/app/host/[gameId]/host-running-scoreboard";
import { HostTeamsPanel } from "@/app/host/[gameId]/host-teams-panel";
import {
  LOBBY_TEAM_JOINED_EVENT,
  LOBBY_TEAM_REMOVED_EVENT,
  lobbyChannelName,
  type LobbyTeamPayload,
  type LobbyTeamRemovedPayload,
} from "@/lib/game/lobby-channel";
import {
  ANSWER_PROGRESS_EVENT,
  GAME_STATE_EVENT,
  WAGER_PROGRESS_EVENT,
  playChannelName,
  type AnswerProgressPayload,
  type PublicFinalResultsRow,
  type PublicGameStatePayload,
  type PublicScoreboardRow,
  type WagerProgressPayload,
} from "@/lib/game/play-channel";
import type { HostRunningScoreRow } from "@/lib/game/host-scoreboard";
import {
  formatQuestionProgress,
  nextStepAfterClose,
} from "@/lib/game/play-rules";
import type { HostPlaySnapshot } from "@/lib/game/play-state";
import type { HostRoundListItem } from "@/lib/game/round-rules";
import type {
  HostGradeQuestionView,
  HostRevealSnapshot,
} from "@/lib/game/scoring";
import type { HostFinalSnapshot } from "@/lib/game/wager-rules";
import { createClient } from "@/lib/supabase/client";
import type { GameStatus } from "@/types/game";

type Props = {
  gameId: string;
  title: string;
  joinCode: string;
  joinUrl: string;
  qrDataUrl: string;
  initialTeams: LobbyTeamPayload[];
  initialPlay: HostPlaySnapshot;
  gradingQuestions: HostGradeQuestionView[];
  revealSnapshot: HostRevealSnapshot | null;
  scoreboard: PublicScoreboardRow[] | null;
  runningScoreboard: HostRunningScoreRow[];
  finalSnapshot: HostFinalSnapshot | null;
  finalResults: PublicFinalResultsRow[] | null;
  rounds: HostRoundListItem[];
};

const initialAction: HostPlayActionState = null;

export function HostConsole({
  gameId,
  title,
  joinCode,
  joinUrl,
  qrDataUrl,
  initialTeams,
  initialPlay,
  gradingQuestions,
  revealSnapshot,
  scoreboard,
  runningScoreboard,
  finalSnapshot,
  finalResults,
  rounds,
}: Props) {
  const router = useRouter();
  const [teams, setTeams] = useState(initialTeams);
  const [status, setStatus] = useState<GameStatus>(initialPlay.status);
  const [play, setPlay] = useState(initialPlay);
  const [submittedIds, setSubmittedIds] = useState(
    () => new Set(initialPlay.submittedTeamIds),
  );
  const [submittedNames, setSubmittedNames] = useState(
    initialPlay.submittedTeamNames,
  );
  const [finalSubmittedIds, setFinalSubmittedIds] = useState(
    () => new Set(finalSnapshot?.submittedTeamIds ?? []),
  );
  const currentQuestionIdRef = useRef(initialPlay.currentQuestion?.id);
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    currentQuestionIdRef.current = play.currentQuestion?.id;
  }, [play.currentQuestion?.id]);

  useEffect(() => {
    const scheduleRefresh = () => {
      if (refreshTimerRef.current) {
        clearTimeout(refreshTimerRef.current);
      }
      refreshTimerRef.current = setTimeout(() => {
        router.refresh();
      }, 250);
    };

    const supabase = createClient();
    const lobby = supabase
      .channel(lobbyChannelName(gameId))
      .on(
        "broadcast",
        { event: LOBBY_TEAM_JOINED_EVENT },
        ({ payload }) => {
          const team = payload as LobbyTeamPayload;
          if (!team?.id || !team.name) return;
          setTeams((current) => {
            if (current.some((row) => row.id === team.id)) return current;
            return [...current, team].sort((a, b) =>
              a.createdAt.localeCompare(b.createdAt),
            );
          });
        },
      )
      .on(
        "broadcast",
        { event: LOBBY_TEAM_REMOVED_EVENT },
        ({ payload }) => {
          const removed = payload as LobbyTeamRemovedPayload;
          if (!removed?.id) return;
          setTeams((current) => current.filter((row) => row.id !== removed.id));
          scheduleRefresh();
        },
      )
      .subscribe();

    const playChannel = supabase
      .channel(playChannelName(gameId))
      .on("broadcast", { event: GAME_STATE_EVENT }, ({ payload }) => {
        const state = payload as PublicGameStatePayload;
        if (!state?.status) return;
        const questionChanged =
          state.questionId !== currentQuestionIdRef.current;
        setStatus(state.status);
        if (questionChanged) {
          setSubmittedIds(new Set());
          setSubmittedNames([]);
          setFinalSubmittedIds(new Set());
        }
        setPlay((current) => ({
          ...current,
          status: state.status,
          currentQuestion: state.questionId
            ? {
                id: state.questionId,
                position: state.questionNumber ?? 0,
                prompt: state.prompt ?? "",
              }
            : current.currentQuestion,
        }));
        router.refresh();
      })
      .on("broadcast", { event: ANSWER_PROGRESS_EVENT }, ({ payload }) => {
        const progress = payload as AnswerProgressPayload;
        if (!progress?.teamId || !progress.questionId) return;
        if (
          currentQuestionIdRef.current &&
          progress.questionId !== currentQuestionIdRef.current
        ) {
          return;
        }
        setSubmittedIds((current) => {
          if (current.has(progress.teamId)) return current;
          const next = new Set(current);
          next.add(progress.teamId);
          return next;
        });
        setSubmittedNames((current) =>
          current.includes(progress.teamName)
            ? current
            : [...current, progress.teamName],
        );
        setFinalSubmittedIds((current) => {
          if (current.has(progress.teamId)) return current;
          const next = new Set(current);
          next.add(progress.teamId);
          return next;
        });
        scheduleRefresh();
      })
      .on("broadcast", { event: WAGER_PROGRESS_EVENT }, ({ payload }) => {
        const progress = payload as WagerProgressPayload;
        if (!progress?.teamId) return;
        setFinalSubmittedIds((current) => {
          if (current.has(progress.teamId)) return current;
          const next = new Set(current);
          next.add(progress.teamId);
          return next;
        });
        scheduleRefresh();
      })
      .subscribe();

    return () => {
      if (refreshTimerRef.current) {
        clearTimeout(refreshTimerRef.current);
      }
      void supabase.removeChannel(lobby);
      void supabase.removeChannel(playChannel);
    };
  }, [gameId, router]);

  const [openState, openAction, openPending] = useActionState(
    openQuestionAction,
    initialAction,
  );
  const [closeState, closeAction, closePending] = useActionState(
    closeQuestionAction,
    initialAction,
  );
  const [advanceState, advanceAction, advancePending] = useActionState(
    advanceOrEndRoundAction,
    initialAction,
  );

  useEffect(() => {
    if (openState?.ok || closeState?.ok || advanceState?.ok) {
      router.refresh();
    }
  }, [openState, closeState, advanceState, router]);

  const actionError =
    openState?.error || closeState?.error || advanceState?.error;

  const firstQuestion = play.questions[0] ?? null;
  const current = play.currentQuestion;
  const roundQuestionCount = play.questions.length;
  const hasNextQuestion =
    current != null &&
    play.questions.some((q) => q.position === current.position + 1);
  const afterClose =
    current != null ? nextStepAfterClose(hasNextQuestion) : null;

  const hasFinalRound = rounds.some((r) => r.isFinal);
  const showFinalSetup = status === "SCOREBOARD" && !hasFinalRound;
  const showProjected = status === "FINAL_REVIEW";

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-10 px-6 py-12">
      <header className="flex flex-col gap-2">
        <p className="text-sm font-medium uppercase tracking-wide text-amber-800">
          Host · {status.replaceAll("_", " ")}
        </p>
        <h1 className="text-3xl font-semibold tracking-tight text-zinc-900">
          {title}
        </h1>
      </header>

      {actionError ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {actionError}
        </p>
      ) : null}

      <section className="grid gap-8 md:grid-cols-[minmax(0,1fr)_220px] md:items-start">
        <div className="flex flex-col gap-4">
          <div>
            <p className="text-sm font-medium text-zinc-500">Join code</p>
            <p className="font-mono text-4xl font-semibold tracking-[0.2em] text-zinc-900">
              {joinCode}
            </p>
          </div>
          <div>
            <p className="text-sm font-medium text-zinc-500">Join URL</p>
            <a
              href={joinUrl}
              className="break-all text-base font-medium text-amber-900 underline"
            >
              {joinUrl}
            </a>
          </div>
          <p className="text-sm text-zinc-600">
            {teams.length} team{teams.length === 1 ? "" : "s"} joined
          </p>
        </div>
        <div className="justify-self-start rounded-xl border border-zinc-200 bg-white p-3 shadow-sm">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={qrDataUrl}
            alt={`QR code linking to ${joinUrl}`}
            width={196}
            height={196}
            className="h-[196px] w-[196px]"
          />
        </div>
      </section>

      <HostRunningScoreboard
        rows={runningScoreboard}
        showProjected={showProjected}
      />

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold text-zinc-900">Teams</h2>
        {teams.length === 0 ? (
          <p className="rounded-lg border border-dashed border-zinc-300 px-4 py-6 text-center text-zinc-500">
            Waiting for the first team…
          </p>
        ) : (
          <ul className="divide-y divide-zinc-200 rounded-lg border border-zinc-200 bg-white">
            {teams.map((team) => (
              <li
                key={team.id}
                className="flex items-center justify-between px-4 py-3 text-zinc-900"
              >
                <span className="font-medium">{team.name}</span>
                {status === "FINAL_QUESTION" &&
                finalSubmittedIds.has(team.id) ? (
                  <span className="text-xs font-medium text-emerald-700">
                    Final submitted
                  </span>
                ) : current && submittedIds.has(team.id) ? (
                  <span className="text-xs font-medium text-emerald-700">
                    Answered
                  </span>
                ) : (
                  <span className="text-xs text-zinc-400">
                    {new Date(team.createdAt).toLocaleTimeString()}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <HostTeamsPanel gameId={gameId} teams={teams} />

      <HostRoundList
        gameId={gameId}
        status={status}
        currentRoundId={play.round?.id ?? null}
        rounds={rounds}
      />

      <section className="flex flex-col gap-4 rounded-xl border border-zinc-200 bg-white p-5">
        <h2 className="text-lg font-semibold text-zinc-900">Round controls</h2>

        {!play.round || play.round.kind === "final" || play.round.kind === "wager" ? (
          <p className="text-sm text-zinc-600">
            Create a round above, then open its first question from here.
          </p>
        ) : (
          <div className="flex flex-col gap-4">
            <p className="text-zinc-700">
              <span className="font-semibold">{play.round.title}</span>
              {" · "}
              {roundQuestionCount} questions ready
            </p>

            {status === "LOBBY" && firstQuestion ? (
              <form action={openAction}>
                <input type="hidden" name="gameId" value={gameId} />
                <input
                  type="hidden"
                  name="questionId"
                  value={firstQuestion.id}
                />
                <button
                  type="submit"
                  disabled={openPending}
                  className="rounded-lg bg-amber-800 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
                >
                  {openPending ? "Opening…" : "Open Question 1"}
                </button>
              </form>
            ) : null}

            {(status === "QUESTION_OPEN" || status === "QUESTION_CLOSED") &&
            current ? (
              <div className="flex flex-col gap-3 rounded-lg border border-zinc-100 bg-zinc-50 p-4">
                <p className="text-sm font-medium text-zinc-500">
                  {formatQuestionProgress(current.position, roundQuestionCount)}
                </p>
                <p className="text-xl font-semibold text-zinc-900">
                  {current.prompt}
                </p>
                <p className="text-sm text-zinc-700">
                  Responses:{" "}
                  <span className="font-semibold">
                    {submittedIds.size} / {teams.length || play.teamCount}
                  </span>
                </p>
                {submittedNames.length > 0 ? (
                  <p className="text-sm text-zinc-600">
                    Submitted: {submittedNames.join(", ")}
                  </p>
                ) : (
                  <p className="text-sm text-zinc-500">No answers yet</p>
                )}

                {status === "QUESTION_OPEN" ? (
                  <form action={closeAction}>
                    <input type="hidden" name="gameId" value={gameId} />
                    <button
                      type="submit"
                      disabled={closePending}
                      className="rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
                    >
                      {closePending ? "Closing…" : "Close question"}
                    </button>
                  </form>
                ) : null}

                {status === "QUESTION_CLOSED" ? (
                  <form action={advanceAction} className="flex flex-col gap-3">
                    <input type="hidden" name="gameId" value={gameId} />
                    {afterClose === "round_break" ? (
                      <label className="flex flex-col gap-1 text-sm font-medium text-zinc-800">
                        Waiting message for teams
                        <textarea
                          name="waitingMessage"
                          rows={3}
                          maxLength={280}
                          placeholder="Optional — shown while you grade (e.g. Grab a drink, music round next…)"
                          className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-normal"
                        />
                      </label>
                    ) : null}
                    <button
                      type="submit"
                      disabled={advancePending}
                      className="w-fit rounded-lg bg-amber-800 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
                    >
                      {advancePending
                        ? "Working…"
                        : afterClose === "round_break"
                          ? "End round"
                          : `Open Question ${(current.position ?? 0) + 1}`}
                    </button>
                  </form>
                ) : null}
              </div>
            ) : null}

            {status === "FINAL_QUESTION" && finalSnapshot ? (
              <p className="text-sm text-zinc-700">
                Final responses submitted:{" "}
                <span className="font-semibold">
                  {finalSubmittedIds.size ||
                    finalSnapshot.submittedTeamIds.length}{" "}
                  / {teams.length || play.teamCount}
                </span>
              </p>
            ) : null}
          </div>
        )}
      </section>

      <HostGradingPanel
        gameId={gameId}
        status={status}
        questions={gradingQuestions}
      />

      <HostRevealPanel
        gameId={gameId}
        status={status}
        reveal={revealSnapshot}
        scoreboard={scoreboard}
      />

      <HostFinalPanel
        gameId={gameId}
        status={status}
        teamCount={teams.length || play.teamCount}
        finalSnapshot={finalSnapshot}
        finalResults={finalResults}
        showFinalSetup={showFinalSetup}
      />
    </main>
  );
}
