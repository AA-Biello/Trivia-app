import type { HostRunningScoreRow } from "@/lib/game/host-scoreboard";

type Props = {
  rows: HostRunningScoreRow[];
  showProjected: boolean;
};

/** Host-only standings. Never shown on team clients. */
export function HostRunningScoreboard({ rows, showProjected }: Props) {
  return (
    <section className="flex flex-col gap-3 rounded-xl border border-zinc-200 bg-white p-5">
      <div>
        <h2 className="text-lg font-semibold text-zinc-900">
          Running scoreboard
        </h2>
        <p className="mt-1 text-sm text-zinc-600">
          Host only — teams do not see this until you publish results.
          {showProjected
            ? " Projected finals use current wagers and grades."
            : null}
        </p>
      </div>
      {rows.length === 0 ? (
        <p className="text-sm text-zinc-500">No teams yet.</p>
      ) : (
        <ol className="divide-y divide-zinc-200 rounded-lg border border-zinc-200">
          {rows.map((row) => (
            <li
              key={row.teamId}
              className="flex items-center justify-between gap-3 px-4 py-3"
            >
              <div>
                <span className="mr-3 font-mono text-sm text-zinc-500">
                  #{row.rank}
                </span>
                <span className="font-medium text-zinc-900">{row.teamName}</span>
              </div>
              <div className="text-right text-sm">
                <p className="font-semibold text-zinc-900">
                  {row.totalPoints} pts
                </p>
                {showProjected && row.projectedFinalPoints != null ? (
                  <p className="text-amber-800">
                    Projected {row.projectedFinalPoints}
                  </p>
                ) : null}
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
