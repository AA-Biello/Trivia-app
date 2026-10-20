"use client";

import { useActionState } from "react";
import { useRouter } from "next/navigation";

import {
  enterFinalReviewAction,
  gradeFinalAnswerAction,
  publishFinalResultsAction,
  startFinalWagerAction,
  type HostFinalActionState,
} from "@/app/actions/host-final";
import type { PublicFinalResultsRow } from "@/lib/game/play-channel";
import type { HostFinalSnapshot } from "@/lib/game/wager-rules";

type Props = {
  gameId: string;
  status: string;
  teamCount: number;
  finalSnapshot: HostFinalSnapshot | null;
  finalResults: PublicFinalResultsRow[] | null;
  showFinalSetup: boolean;
};

const initial: HostFinalActionState = null;

export function HostFinalPanel({
  gameId,
  status,
  teamCount,
  finalSnapshot,
  finalResults,
  showFinalSetup,
}: Props) {
  const router = useRouter();

  const [startState, startAction, startPending] = useActionState(
    startFinalWagerAction,
    initial,
  );
  const [reviewState, reviewAction, reviewPending] = useActionState(
    enterFinalReviewAction,
    initial,
  );
  const [gradeState, gradeAction, gradePending] = useActionState(
    gradeFinalAnswerAction,
    initial,
  );
  const [publishState, publishAction, publishPending] = useActionState(
    publishFinalResultsAction,
    initial,
  );

  const error =
    startState?.error ||
    reviewState?.error ||
    gradeState?.error ||
    publishState?.error;

  if (status === "SCOREBOARD" && showFinalSetup) {
    return (
      <section className="flex flex-col gap-4 rounded-xl border border-zinc-200 bg-white p-5">
        <h2 className="text-lg font-semibold text-zinc-900">
          Start final wager
        </h2>
        <p className="text-sm text-zinc-600">
          Optional and explicit — teams will see the final question and can
          submit or change their answer and wager until you close grading.
          Cumulative scores are used as the starting total.
        </p>
        {error ? (
          <p className="text-sm text-red-700" role="alert">
            {error}
          </p>
        ) : null}
        <form
          action={async (fd) => {
            await startAction(fd);
            router.refresh();
          }}
          className="flex flex-col gap-3"
        >
          <input type="hidden" name="gameId" value={gameId} />
          <label className="flex flex-col gap-1 text-sm font-medium">
            Final question prompt
            <textarea
              name="prompt"
              required
              rows={3}
              className="rounded-lg border border-zinc-300 px-3 py-2"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium">
            Correct answer (host only)
            <input
              name="correctAnswer"
              required
              className="rounded-lg border border-zinc-300 px-3 py-2"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium">
            Maximum wager
            <input
              name="maxWager"
              type="number"
              min={0}
              step={1}
              required
              defaultValue={5}
              className="w-32 rounded-lg border border-zinc-300 px-3 py-2"
            />
          </label>
          <button
            type="submit"
            disabled={startPending}
            className="w-fit rounded-lg bg-amber-800 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
          >
            {startPending ? "Opening…" : "Start final wager"}
          </button>
        </form>
      </section>
    );
  }

  if (
    status !== "FINAL_QUESTION" &&
    status !== "FINAL_REVIEW" &&
    status !== "FINAL_RESULTS" &&
    status !== "GAME_OVER"
  ) {
    return null;
  }

  return (
    <section className="flex flex-col gap-4 rounded-xl border border-zinc-200 bg-white p-5">
      <h2 className="text-lg font-semibold text-zinc-900">Final wager</h2>
      {error ? (
        <p className="text-sm text-red-700" role="alert">
          {error}
        </p>
      ) : null}

      {finalSnapshot ? (
        <div className="rounded-lg border border-zinc-100 bg-zinc-50 p-4 text-sm">
          <p className="font-medium text-zinc-500">Final question</p>
          <p className="mt-1 text-lg font-semibold text-zinc-900">
            {finalSnapshot.prompt}
          </p>
          <p className="mt-2 text-zinc-700">
            Max wager: {finalSnapshot.maxWager} · Correct (host):{" "}
            <span className="font-semibold">{finalSnapshot.correctAnswer}</span>
          </p>
        </div>
      ) : null}

      {status === "FINAL_QUESTION" && finalSnapshot ? (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-zinc-700">
            Submitted final responses:{" "}
            <span className="font-semibold">
              {finalSnapshot.submittedTeamIds.length} / {teamCount}
            </span>
          </p>
          {finalSnapshot.submittedTeamNames.length > 0 ? (
            <p className="text-sm text-zinc-600">
              In: {finalSnapshot.submittedTeamNames.join(", ")}
            </p>
          ) : (
            <p className="text-sm text-zinc-500">No responses yet</p>
          )}

          <ul className="flex flex-col gap-3">
            {finalSnapshot.reviewRows.map((row) => (
              <li
                key={row.teamId}
                className="rounded-lg border border-zinc-200 p-3"
              >
                <p className="font-medium text-zinc-900">{row.teamName}</p>
                <p className="text-sm text-zinc-600">
                  Starting {row.startingScore} · Wager{" "}
                  {row.wagerAmount ?? "—"}
                </p>
                <p className="mt-1 whitespace-pre-wrap text-zinc-800">
                  {row.answerText ?? "(no answer yet)"}
                </p>
              </li>
            ))}
          </ul>

          <form
            action={async (fd) => {
              await reviewAction(fd);
              router.refresh();
            }}
          >
            <input type="hidden" name="gameId" value={gameId} />
            <button
              type="submit"
              disabled={reviewPending}
              className="rounded-lg bg-amber-800 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
            >
              {reviewPending ? "Opening…" : "Close & grade final answers"}
            </button>
          </form>
        </div>
      ) : null}

      {status === "FINAL_REVIEW" && finalSnapshot ? (
        <div className="flex flex-col gap-4">
          <p className="text-sm text-zinc-600">
            No answer counts as incorrect on publish. Teams cannot see grades
            or final standings until you publish.
          </p>
          <ul className="flex flex-col gap-3">
            {finalSnapshot.reviewRows.map((row) => (
              <li
                key={row.teamId}
                className="rounded-lg border border-zinc-200 p-3"
              >
                <div className="flex flex-col gap-1 sm:flex-row sm:justify-between">
                  <div>
                    <p className="font-medium text-zinc-900">{row.teamName}</p>
                    <p className="text-sm text-zinc-600">
                      Starting {row.startingScore} · Wager{" "}
                      {row.wagerAmount ?? 0}
                    </p>
                    <p className="mt-1 whitespace-pre-wrap text-zinc-800">
                      {row.answerText ?? "(no answer)"}
                    </p>
                    {row.isCorrect != null ? (
                      <p className="mt-1 text-xs font-medium text-zinc-500">
                        {row.isCorrect ? "Correct" : "Incorrect"}
                      </p>
                    ) : row.answerId ? (
                      <p className="mt-1 text-xs text-amber-700">Ungraded</p>
                    ) : (
                      <p className="mt-1 text-xs text-zinc-500">
                        Will score as incorrect
                      </p>
                    )}
                  </div>
                  {row.answerId ? (
                    <div className="flex flex-wrap gap-2">
                      <form
                        action={async (fd) => {
                          await gradeAction(fd);
                          router.refresh();
                        }}
                      >
                        <input type="hidden" name="gameId" value={gameId} />
                        <input
                          type="hidden"
                          name="answerId"
                          value={row.answerId}
                        />
                        <input type="hidden" name="mark" value="correct" />
                        <button
                          type="submit"
                          disabled={gradePending}
                          className="rounded-lg bg-emerald-700 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-60"
                        >
                          Correct
                        </button>
                      </form>
                      <form
                        action={async (fd) => {
                          await gradeAction(fd);
                          router.refresh();
                        }}
                      >
                        <input type="hidden" name="gameId" value={gameId} />
                        <input
                          type="hidden"
                          name="answerId"
                          value={row.answerId}
                        />
                        <input type="hidden" name="mark" value="incorrect" />
                        <button
                          type="submit"
                          disabled={gradePending}
                          className="rounded-lg bg-zinc-800 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-60"
                        >
                          Incorrect
                        </button>
                      </form>
                    </div>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
          <form
            action={async (fd) => {
              await publishAction(fd);
              router.refresh();
            }}
          >
            <input type="hidden" name="gameId" value={gameId} />
            <button
              type="submit"
              disabled={publishPending}
              className="rounded-lg bg-emerald-800 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
            >
              {publishPending ? "Publishing…" : "Publish final results"}
            </button>
          </form>
        </div>
      ) : null}

      {(status === "FINAL_RESULTS" || status === "GAME_OVER") &&
      finalResults ? (
        <ol className="divide-y divide-zinc-200 rounded-lg border border-zinc-200">
          {finalResults.map((row) => (
            <li
              key={`${row.rank}-${row.teamName}`}
              className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <div>
                <span className="mr-3 font-mono text-sm text-zinc-500">
                  #{row.rank}
                </span>
                <span className="font-medium text-zinc-900">{row.teamName}</span>
                <p className="mt-1 text-sm text-zinc-600">
                  Start {row.startingScore} · Wager {row.wager} ·{" "}
                  {row.isCorrect ? "Correct" : "Incorrect"}
                </p>
                <p className="whitespace-pre-wrap text-sm text-zinc-700">
                  {row.answerText ?? "(no answer)"}
                </p>
              </div>
              <p className="text-lg font-semibold text-zinc-900">
                {row.finalScore}
              </p>
            </li>
          ))}
        </ol>
      ) : null}
    </section>
  );
}
