"use client";

import { useActionState, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import {
  enterRoundReviewAction,
  gradeAnswerAction,
  saveCorrectAnswerAction,
  startRevealAction,
  type HostGradeActionState,
} from "@/app/actions/host-grade";
import type { HostGradeQuestionView } from "@/lib/game/scoring";

type Props = {
  gameId: string;
  status: string;
  questions: HostGradeQuestionView[];
};

const initial: HostGradeActionState = null;

export function HostGradingPanel({ gameId, status, questions }: Props) {
  const router = useRouter();
  const [selectedId, setSelectedId] = useState(questions[0]?.id ?? "");
  const selected =
    questions.find((q) => q.id === selectedId) ?? questions[0] ?? null;

  const [reviewState, reviewAction, reviewPending] = useActionState(
    enterRoundReviewAction,
    initial,
  );
  const [secretState, secretAction, secretPending] = useActionState(
    saveCorrectAnswerAction,
    initial,
  );
  const [gradeState, gradeAction, gradePending] = useActionState(
    gradeAnswerAction,
    initial,
  );
  const [revealState, revealAction, revealPending] = useActionState(
    startRevealAction,
    initial,
  );

  const grouped = useMemo(() => {
    if (!selected) return [];
    const map = new Map<string, typeof selected.answers>();
    for (const answer of selected.answers) {
      const key = answer.answerText.trim().toLowerCase();
      const list = map.get(key) ?? [];
      list.push(answer);
      map.set(key, list);
    }
    return [...map.entries()].sort((a, b) => b[1].length - a[1].length);
  }, [selected]);

  const error =
    reviewState?.error ||
    secretState?.error ||
    gradeState?.error ||
    revealState?.error;

  const gradedCount = questions.reduce(
    (sum, q) => sum + q.answers.filter((a) => a.isCorrect != null).length,
    0,
  );
  const answerCount = questions.reduce((sum, q) => sum + q.answers.length, 0);

  if (status === "ROUND_BREAK") {
    return (
      <section className="flex flex-col gap-3 rounded-xl border border-zinc-200 bg-white p-5">
        <h2 className="text-lg font-semibold text-zinc-900">Round review</h2>
        <p className="text-sm text-zinc-600">
          The round is over. Enter review to grade answers and set correct
          answers before reveal.
        </p>
        {error ? (
          <p className="text-sm text-red-700" role="alert">
            {error}
          </p>
        ) : null}
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
            {reviewPending ? "Opening…" : "Start grading / review"}
          </button>
        </form>
      </section>
    );
  }

  if (status !== "ROUND_REVIEW" || !selected) {
    return null;
  }

  return (
    <section className="flex flex-col gap-4 rounded-xl border border-zinc-200 bg-white p-5">
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold text-zinc-900">Grading</h2>
        <p className="text-sm text-zinc-600">
          Graded {gradedCount} / {answerCount} submitted answers. Teams cannot
          see grades until you reveal.
        </p>
      </div>

      {error ? (
        <p className="text-sm text-red-700" role="alert">
          {error}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {questions.map((q) => {
          const done = q.answers.every((a) => a.isCorrect != null);
          return (
            <button
              key={q.id}
              type="button"
              onClick={() => setSelectedId(q.id)}
              className={`rounded-lg border px-3 py-1.5 text-sm ${
                selected.id === q.id
                  ? "border-zinc-900 bg-zinc-900 text-white"
                  : "border-zinc-300 bg-white"
              }`}
            >
              Q{q.position}
              {done ? " ✓" : ""}
            </button>
          );
        })}
      </div>

      <div className="rounded-lg border border-zinc-100 bg-zinc-50 p-4">
        <p className="text-sm font-medium text-zinc-500">
          Question {selected.position}
        </p>
        <p className="mt-1 text-lg font-semibold text-zinc-900">
          {selected.prompt}
        </p>

        <form
          action={async (fd) => {
            await secretAction(fd);
            router.refresh();
          }}
          className="mt-4 flex flex-col gap-2"
        >
          <input type="hidden" name="gameId" value={gameId} />
          <input type="hidden" name="questionId" value={selected.id} />
          <label className="flex flex-col gap-1 text-sm font-medium">
            Correct answer (host only)
            <input
              name="correctAnswer"
              defaultValue={selected.correctAnswer}
              key={`correct-${selected.id}-${selected.correctAnswer}`}
              className="rounded-lg border border-zinc-300 bg-white px-3 py-2"
              placeholder="e.g. 1955"
            />
          </label>
          <button
            type="submit"
            disabled={secretPending}
            className="w-fit rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium disabled:opacity-60"
          >
            {secretPending ? "Saving…" : "Save correct answer"}
          </button>
        </form>
      </div>

      {selected.unansweredTeams.length > 0 ? (
        <p className="text-sm text-zinc-600">
          No answer:{" "}
          {selected.unansweredTeams.map((t) => t.teamName).join(", ")}
        </p>
      ) : null}

      <div className="flex flex-col gap-4">
        {grouped.map(([key, answers]) => (
          <div
            key={key}
            className="rounded-lg border border-zinc-200 bg-white p-3"
          >
            <p className="mb-2 text-sm font-medium text-zinc-500">
              {answers.length} team{answers.length === 1 ? "" : "s"} answered
              similarly
            </p>
            <ul className="flex flex-col gap-3">
              {answers.map((answer) => (
                <li
                  key={answer.answerId}
                  className="flex flex-col gap-2 border-t border-zinc-100 pt-3 first:border-0 first:pt-0 sm:flex-row sm:items-start sm:justify-between"
                >
                  <div>
                    <p className="font-medium text-zinc-900">{answer.teamName}</p>
                    <p className="whitespace-pre-wrap text-zinc-700">
                      {answer.answerText}
                    </p>
                    {answer.isCorrect != null ? (
                      <p className="mt-1 text-xs font-medium text-zinc-500">
                        {answer.isCorrect ? "Correct" : "Incorrect"} ·{" "}
                        {answer.pointsAwarded ?? 0} pt
                      </p>
                    ) : (
                      <p className="mt-1 text-xs text-amber-700">Ungraded</p>
                    )}
                  </div>
                  <div className="flex flex-col gap-2">
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
                          value={answer.answerId}
                        />
                        <input type="hidden" name="mark" value="correct" />
                        <input type="hidden" name="points" value="1" />
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
                          value={answer.answerId}
                        />
                        <input type="hidden" name="mark" value="incorrect" />
                        <input type="hidden" name="points" value="0" />
                        <button
                          type="submit"
                          disabled={gradePending}
                          className="rounded-lg bg-zinc-800 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-60"
                        >
                          Incorrect
                        </button>
                      </form>
                    </div>
                    <form
                      action={async (fd) => {
                        await gradeAction(fd);
                        router.refresh();
                      }}
                      className="flex flex-wrap items-end gap-2"
                    >
                      <input type="hidden" name="gameId" value={gameId} />
                      <input
                        type="hidden"
                        name="answerId"
                        value={answer.answerId}
                      />
                      <input type="hidden" name="mark" value="correct" />
                      <label className="flex flex-col gap-0.5 text-xs font-medium text-zinc-600">
                        Override points
                        <input
                          name="points"
                          type="number"
                          defaultValue={answer.pointsAwarded ?? 1}
                          className="w-20 rounded border border-zinc-300 px-2 py-1 text-sm"
                        />
                      </label>
                      <button
                        type="submit"
                        disabled={gradePending}
                        className="rounded-lg border border-zinc-300 px-2 py-1 text-xs font-medium disabled:opacity-60"
                      >
                        Apply
                      </button>
                    </form>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <form
        action={async (fd) => {
          await revealAction(fd);
          router.refresh();
        }}
      >
        <input type="hidden" name="gameId" value={gameId} />
        <button
          type="submit"
          disabled={revealPending}
          className="rounded-lg bg-amber-800 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
        >
          {revealPending ? "Starting…" : "Start reveal mode"}
        </button>
      </form>
    </section>
  );
}
