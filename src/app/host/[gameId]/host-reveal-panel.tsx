"use client";

import { useActionState } from "react";
import { useRouter } from "next/navigation";

import {
  finishRevealAction,
  hideRevealAction,
  publishScoreboardAction,
  revealCorrectAnswerAction,
  revealGoToQuestionAction,
  revealTeamAnswersAction,
  type HostGradeActionState,
} from "@/app/actions/host-grade";
import { formatQuestionProgress } from "@/lib/game/play-rules";
import type { PublicScoreboardRow } from "@/lib/game/play-channel";
import type { HostRevealSnapshot } from "@/lib/game/scoring";

type Props = {
  gameId: string;
  status: string;
  reveal: HostRevealSnapshot | null;
  scoreboard: PublicScoreboardRow[] | null;
};

const initial: HostGradeActionState = null;

export function HostRevealPanel({
  gameId,
  status,
  reveal,
  scoreboard,
}: Props) {
  const router = useRouter();
  const [correctState, correctAction, correctPending] = useActionState(
    revealCorrectAnswerAction,
    initial,
  );
  const [teamsState, teamsAction, teamsPending] = useActionState(
    revealTeamAnswersAction,
    initial,
  );
  const [hideState, hideAction, hidePending] = useActionState(
    hideRevealAction,
    initial,
  );
  const [navState, navAction, navPending] = useActionState(
    revealGoToQuestionAction,
    initial,
  );
  const [finishState, finishAction, finishPending] = useActionState(
    finishRevealAction,
    initial,
  );
  const [scoreState, scoreAction, scorePending] = useActionState(
    publishScoreboardAction,
    initial,
  );

  const error =
    correctState?.error ||
    teamsState?.error ||
    hideState?.error ||
    navState?.error ||
    finishState?.error ||
    scoreState?.error;

  if (status === "SCOREBOARD" || status === "RESULTS_PUBLISHED") {
    return (
      <section className="flex flex-col gap-4 rounded-xl border border-zinc-200 bg-white p-5">
        <h2 className="text-lg font-semibold text-zinc-900">Scoreboard</h2>
        {error ? (
          <p className="text-sm text-red-700" role="alert">
            {error}
          </p>
        ) : null}
        {scoreboard && scoreboard.length > 0 ? (
          <ol className="divide-y divide-zinc-200 rounded-lg border border-zinc-200">
            {scoreboard.map((row) => (
              <li
                key={`${row.rank}-${row.teamName}`}
                className="flex items-center justify-between px-4 py-3"
              >
                <div>
                  <span className="mr-3 font-mono text-sm text-zinc-500">
                    #{row.rank}
                  </span>
                  <span className="font-medium text-zinc-900">{row.teamName}</span>
                </div>
                <div className="text-right text-sm">
                  <p className="font-semibold text-zinc-900">
                    {row.totalPoints} total
                  </p>
                  <p className="text-zinc-500">{row.roundPoints} this round</p>
                </div>
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-sm text-zinc-600">No published scores yet.</p>
        )}
        {status === "RESULTS_PUBLISHED" ? (
          <form
            action={async (fd) => {
              await scoreAction(fd);
              router.refresh();
            }}
          >
            <input type="hidden" name="gameId" value={gameId} />
            <button
              type="submit"
              disabled={scorePending}
              className="rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
            >
              {scorePending ? "Publishing…" : "Publish scoreboard"}
            </button>
          </form>
        ) : null}
      </section>
    );
  }

  if (status !== "REVEAL" || !reveal) {
    return null;
  }

  return (
    <section className="flex flex-col gap-4 rounded-xl border border-zinc-200 bg-white p-5">
      <h2 className="text-lg font-semibold text-zinc-900">Reveal mode</h2>
      {error ? (
        <p className="text-sm text-red-700" role="alert">
          {error}
        </p>
      ) : null}

      <div className="rounded-lg border border-zinc-100 bg-zinc-50 p-4">
        <p className="text-sm font-medium text-zinc-500">
          {reveal.questionNumber != null
            ? formatQuestionProgress(reveal.questionNumber, reveal.questionCount)
            : null}
        </p>
        <p className="mt-1 text-xl font-semibold text-zinc-900">
          {reveal.prompt}
        </p>
        <p className="mt-3 text-sm text-zinc-700">
          Correct answer (host):{" "}
          <span className="font-semibold">
            {reveal.correctAnswer || "(not set)"}
          </span>
        </p>
        <p className="mt-1 text-xs text-zinc-500">
          Audience sees correct answer:{" "}
          {reveal.correctAnswerRevealed ? "yes" : "no"} · team answers:{" "}
          {reveal.teamAnswersRevealed ? "yes" : "no"}
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <form
          action={async (fd) => {
            await navAction(fd);
            router.refresh();
          }}
        >
          <input type="hidden" name="gameId" value={gameId} />
          <input type="hidden" name="direction" value="prev" />
          <button
            type="submit"
            disabled={navPending}
            className="rounded-lg border border-zinc-300 px-3 py-2 text-sm font-medium disabled:opacity-60"
          >
            Previous question
          </button>
        </form>
        <form
          action={async (fd) => {
            await navAction(fd);
            router.refresh();
          }}
        >
          <input type="hidden" name="gameId" value={gameId} />
          <input type="hidden" name="direction" value="next" />
          <button
            type="submit"
            disabled={navPending}
            className="rounded-lg border border-zinc-300 px-3 py-2 text-sm font-medium disabled:opacity-60"
          >
            Next question
          </button>
        </form>
        <form
          action={async (fd) => {
            await correctAction(fd);
            router.refresh();
          }}
        >
          <input type="hidden" name="gameId" value={gameId} />
          <button
            type="submit"
            disabled={correctPending}
            className="rounded-lg bg-amber-800 px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
          >
            Reveal correct answer
          </button>
        </form>
        <form
          action={async (fd) => {
            await teamsAction(fd);
            router.refresh();
          }}
        >
          <input type="hidden" name="gameId" value={gameId} />
          <button
            type="submit"
            disabled={teamsPending}
            className="rounded-lg bg-zinc-900 px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
          >
            Reveal team answers
          </button>
        </form>
        <form
          action={async (fd) => {
            await hideAction(fd);
            router.refresh();
          }}
        >
          <input type="hidden" name="gameId" value={gameId} />
          <button
            type="submit"
            disabled={hidePending}
            className="rounded-lg border border-zinc-300 px-3 py-2 text-sm font-medium disabled:opacity-60"
          >
            Hide reveal
          </button>
        </form>
      </div>

      <div className="flex flex-wrap gap-2">
        <form
          action={async (fd) => {
            await finishAction(fd);
            router.refresh();
          }}
        >
          <input type="hidden" name="gameId" value={gameId} />
          <button
            type="submit"
            disabled={finishPending}
            className="rounded-lg border border-zinc-300 px-3 py-2 text-sm font-medium disabled:opacity-60"
          >
            Finish reveal
          </button>
        </form>
        <form
          action={async (fd) => {
            await scoreAction(fd);
            router.refresh();
          }}
        >
          <input type="hidden" name="gameId" value={gameId} />
          <button
            type="submit"
            disabled={scorePending}
            className="rounded-lg bg-emerald-800 px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
          >
            Publish scoreboard
          </button>
        </form>
      </div>
    </section>
  );
}
