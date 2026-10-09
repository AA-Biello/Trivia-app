"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import {
  advanceOrEndRoundAction,
  closeQuestionAction,
  createRoundAction,
  openQuestionAction,
  type HostPlayActionState,
} from "@/app/actions/host-play";
import {
  LOBBY_TEAM_JOINED_EVENT,
  lobbyChannelName,
  type LobbyTeamPayload,
} from "@/lib/game/lobby-channel";
import {
  ANSWER_PROGRESS_EVENT,
  GAME_STATE_EVENT,
  playChannelName,
  type AnswerProgressPayload,
  type PublicGameStatePayload,
} from "@/lib/game/play-channel";
import {
  MUSIC_ROUND_QUESTION_COUNT,
  STANDARD_ROUND_QUESTION_COUNT,
  formatQuestionProgress,
  nextStepAfterClose,
} from "@/lib/game/play-rules";
import type { HostPlaySnapshot } from "@/lib/game/play-state";
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
  const [questionCount, setQuestionCount] = useState<number>(
    STANDARD_ROUND_QUESTION_COUNT,
  );
  const currentQuestionIdRef = useRef(initialPlay.currentQuestion?.id);

  useEffect(() => {
    currentQuestionIdRef.current = play.currentQuestion?.id;
  }, [play.currentQuestion?.id]);

  useEffect(() => {
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
      })
      .subscribe();

    return () => {
      void supabase.removeChannel(lobby);
      void supabase.removeChannel(playChannel);
    };
  }, [gameId, router]);

  const [createState, createAction, createPending] = useActionState(
    createRoundAction,
    initialAction,
  );
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
    if (
      createState?.ok ||
      openState?.ok ||
      closeState?.ok ||
      advanceState?.ok
    ) {
      router.refresh();
    }
  }, [createState, openState, closeState, advanceState, router]);

  const actionError =
    createState?.error ||
    openState?.error ||
    closeState?.error ||
    advanceState?.error;

  const firstQuestion = play.questions[0] ?? null;
  const current = play.currentQuestion;
  const roundQuestionCount = play.questions.length;
  const hasNextQuestion =
    current != null &&
    play.questions.some((q) => q.position === current.position + 1);
  const afterClose =
    current != null ? nextStepAfterClose(hasNextQuestion) : null;

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
                {current && submittedIds.has(team.id) ? (
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

      <section className="flex flex-col gap-4 rounded-xl border border-zinc-200 bg-white p-5">
        <h2 className="text-lg font-semibold text-zinc-900">Round controls</h2>

        {!play.round ? (
          <form action={createAction} className="flex flex-col gap-4">
            <input type="hidden" name="gameId" value={gameId} />
            <label className="flex flex-col gap-1 text-sm font-medium">
              Round title
              <input
                name="title"
                defaultValue="Round 1"
                maxLength={80}
                className="rounded-lg border border-zinc-300 px-3 py-2"
              />
            </label>
            <fieldset className="flex flex-col gap-2">
              <legend className="text-sm font-medium">Questions in this round</legend>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setQuestionCount(STANDARD_ROUND_QUESTION_COUNT)}
                  className={`rounded-lg border px-3 py-1.5 text-sm ${
                    questionCount === STANDARD_ROUND_QUESTION_COUNT
                      ? "border-zinc-900 bg-zinc-900 text-white"
                      : "border-zinc-300 bg-white text-zinc-800"
                  }`}
                >
                  Standard ({STANDARD_ROUND_QUESTION_COUNT})
                </button>
                <button
                  type="button"
                  onClick={() => setQuestionCount(MUSIC_ROUND_QUESTION_COUNT)}
                  className={`rounded-lg border px-3 py-1.5 text-sm ${
                    questionCount === MUSIC_ROUND_QUESTION_COUNT
                      ? "border-zinc-900 bg-zinc-900 text-white"
                      : "border-zinc-300 bg-white text-zinc-800"
                  }`}
                >
                  Music ({MUSIC_ROUND_QUESTION_COUNT})
                </button>
              </div>
              <label className="flex flex-col gap-1 text-sm font-medium">
                Custom count
                <input
                  name="questionCount"
                  type="number"
                  min={1}
                  max={30}
                  value={questionCount}
                  onChange={(event) => {
                    const next = Number.parseInt(event.target.value, 10);
                    if (Number.isInteger(next)) {
                      setQuestionCount(next);
                    }
                  }}
                  className="w-28 rounded-lg border border-zinc-300 px-3 py-2"
                />
              </label>
            </fieldset>
            {Array.from({ length: questionCount }, (_, i) => (
              <label key={i} className="flex flex-col gap-1 text-sm font-medium">
                Question {i + 1}
                <textarea
                  name={`prompt${i + 1}`}
                  required
                  rows={2}
                  className="rounded-lg border border-zinc-300 px-3 py-2"
                  placeholder={`Prompt for question ${i + 1}`}
                />
              </label>
            ))}
            <button
              type="submit"
              disabled={createPending || status !== "LOBBY"}
              className="rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
            >
              {createPending
                ? "Saving…"
                : `Save round (${questionCount} questions)`}
            </button>
          </form>
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
                  <form action={advanceAction}>
                    <input type="hidden" name="gameId" value={gameId} />
                    <button
                      type="submit"
                      disabled={advancePending}
                      className="rounded-lg bg-amber-800 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
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

            {status === "ROUND_BREAK" ? (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-4 text-amber-950">
                <p className="font-semibold">Round complete</p>
                <p className="text-sm">
                  Teams are on break. Grading and reveals come in a later
                  milestone.
                </p>
              </div>
            ) : null}
          </div>
        )}
      </section>
    </main>
  );
}
