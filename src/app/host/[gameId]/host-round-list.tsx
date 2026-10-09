"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";

import {
  createRoundAction,
  startNextRoundAction,
  type HostPlayActionState,
} from "@/app/actions/host-play";
import {
  MUSIC_ROUND_QUESTION_COUNT,
  STANDARD_ROUND_QUESTION_COUNT,
} from "@/lib/game/play-rules";
import {
  findNextPlayableRound,
  type HostRoundListItem,
} from "@/lib/game/round-rules";

type Props = {
  gameId: string;
  status: string;
  currentRoundId: string | null;
  rounds: HostRoundListItem[];
};

const initial: HostPlayActionState = null;

export function HostRoundList({
  gameId,
  status,
  currentRoundId,
  rounds,
}: Props) {
  const router = useRouter();
  const [showCreate, setShowCreate] = useState(false);
  const [questionCount, setQuestionCount] = useState<number>(
    STANDARD_ROUND_QUESTION_COUNT,
  );
  const [createState, createAction, createPending] = useActionState(
    createRoundAction,
    initial,
  );
  const [startState, startAction, startPending] = useActionState(
    startNextRoundAction,
    initial,
  );

  const playable = rounds.filter((r) => !r.isFinal);
  const nextRound = findNextPlayableRound(
    playable.map((r) => ({ id: r.id, position: r.position, kind: r.kind })),
    currentRoundId,
  );
  const nextReady =
    nextRound &&
    playable.find((r) => r.id === nextRound.id)?.status === "upcoming";

  const error = createState?.error || startState?.error;
  const canAuthor =
    status === "LOBBY" || status === "SCOREBOARD";

  return (
    <section className="flex flex-col gap-4 rounded-xl border border-zinc-200 bg-white p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-zinc-900">Rounds</h2>
        {canAuthor ? (
          <button
            type="button"
            onClick={() => setShowCreate((v) => !v)}
            className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm font-medium"
          >
            {showCreate
              ? "Cancel"
              : status === "SCOREBOARD"
                ? "Create next round"
                : "Add round"}
          </button>
        ) : null}
      </div>

      {playable.length === 0 ? (
        <p className="text-sm text-zinc-500">No rounds yet.</p>
      ) : (
        <ol className="divide-y divide-zinc-200 rounded-lg border border-zinc-200">
          {playable.map((round) => (
            <li
              key={round.id}
              className="flex flex-wrap items-center justify-between gap-2 px-4 py-3"
            >
              <div>
                <p className="font-medium text-zinc-900">
                  Round {round.position}: {round.title}
                </p>
                <p className="text-sm text-zinc-600">
                  {round.displayTypeLabel} · {round.questionCount} questions
                </p>
              </div>
              <span className="rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs font-medium uppercase tracking-wide text-zinc-700">
                {round.status.replaceAll("_", " ")}
              </span>
            </li>
          ))}
        </ol>
      )}

      {error ? (
        <p className="text-sm text-red-700" role="alert">
          {error}
        </p>
      ) : null}

      {status === "SCOREBOARD" && nextReady && nextRound ? (
        <form
          action={async (fd) => {
            await startAction(fd);
            router.refresh();
          }}
        >
          <input type="hidden" name="gameId" value={gameId} />
          <input type="hidden" name="roundId" value={nextRound.id} />
          <button
            type="submit"
            disabled={startPending}
            className="rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
          >
            {startPending
              ? "Starting…"
              : `Start next round (Round ${nextRound.position})`}
          </button>
        </form>
      ) : null}

      {status === "SCOREBOARD" && !nextReady ? (
        <p className="text-sm text-zinc-600">
          No next round is ready. Create another round, or start the final
          wager below — nothing is forced automatically.
        </p>
      ) : null}

      {showCreate && canAuthor ? (
        <form
          action={async (fd) => {
            await createAction(fd);
            setShowCreate(false);
            router.refresh();
          }}
          className="flex flex-col gap-4 border-t border-zinc-100 pt-4"
        >
          <input type="hidden" name="gameId" value={gameId} />
          <label className="flex flex-col gap-1 text-sm font-medium">
            Round title
            <input
              name="title"
              defaultValue={`Round ${playable.length + 1}`}
              maxLength={80}
              className="rounded-lg border border-zinc-300 px-3 py-2"
            />
          </label>
          <fieldset className="flex flex-col gap-2">
            <legend className="text-sm font-medium">Questions</legend>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setQuestionCount(STANDARD_ROUND_QUESTION_COUNT)}
                className={`rounded-lg border px-3 py-1.5 text-sm ${
                  questionCount === STANDARD_ROUND_QUESTION_COUNT
                    ? "border-zinc-900 bg-zinc-900 text-white"
                    : "border-zinc-300 bg-white"
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
                    : "border-zinc-300 bg-white"
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
                onChange={(e) => {
                  const n = Number.parseInt(e.target.value, 10);
                  if (Number.isInteger(n)) setQuestionCount(n);
                }}
                className="w-28 rounded-lg border border-zinc-300 px-3 py-2"
              />
            </label>
          </fieldset>
          {Array.from({ length: questionCount }, (_, i) => (
            <div key={i} className="flex flex-col gap-2">
              <label className="flex flex-col gap-1 text-sm font-medium">
                Question {i + 1}
                <textarea
                  name={`prompt${i + 1}`}
                  required
                  rows={2}
                  className="rounded-lg border border-zinc-300 px-3 py-2"
                />
              </label>
              <label className="flex flex-col gap-1 text-sm font-medium">
                Correct answer (host only)
                <input
                  name={`correct${i + 1}`}
                  className="rounded-lg border border-zinc-300 px-3 py-2"
                />
              </label>
            </div>
          ))}
          <button
            type="submit"
            disabled={createPending}
            className="w-fit rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
          >
            {createPending
              ? "Saving…"
              : `Save round (${questionCount} questions)`}
          </button>
        </form>
      ) : null}
    </section>
  );
}
