"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import {
  hostAddTeamAction,
  hostReissueTeamSessionAction,
  hostRemoveTeamAction,
  type HostTeamActionState,
} from "@/app/actions/host-teams";
import type { LobbyTeamPayload } from "@/lib/game/lobby-channel";

type Props = {
  gameId: string;
  teams: LobbyTeamPayload[];
};

const initial: HostTeamActionState = null;

export function HostTeamsPanel({ gameId, teams }: Props) {
  const router = useRouter();
  const [dismissedClaimKey, setDismissedClaimKey] = useState<string | null>(
    null,
  );
  const [copied, setCopied] = useState(false);

  const [addState, addAction, addPending] = useActionState(
    hostAddTeamAction,
    initial,
  );
  const [reissueState, reissueAction, reissuePending] = useActionState(
    hostReissueTeamSessionAction,
    initial,
  );
  const [removeState, removeAction, removePending] = useActionState(
    hostRemoveTeamAction,
    initial,
  );

  const claimSource = addState?.claimUrl
    ? addState
    : reissueState?.claimUrl
      ? reissueState
      : null;
  const claimKey = claimSource?.claimUrl ?? null;
  const claimUrl =
    claimKey && claimKey !== dismissedClaimKey ? claimKey : null;
  const claimTeam = claimUrl ? (claimSource?.teamName ?? null) : null;

  useEffect(() => {
    if (addState?.ok || reissueState?.ok || removeState?.ok) {
      router.refresh();
    }
  }, [addState, reissueState, removeState, router]);

  const error = addState?.error || reissueState?.error || removeState?.error;

  return (
    <section className="flex flex-col gap-4 rounded-xl border border-zinc-200 bg-white p-5">
      <div>
        <h2 className="text-lg font-semibold text-zinc-900">Manage teams</h2>
        <p className="mt-1 text-sm text-zinc-600">
          Add a team, remove one, or issue a new device link when someone
          changes phones.
        </p>
      </div>

      {error ? (
        <p className="text-sm text-red-700" role="alert">
          {error}
        </p>
      ) : null}

      {claimUrl ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm">
          <p className="font-medium text-amber-950">
            Device link
            {claimTeam ? ` for ${claimTeam}` : ""}
          </p>
          <p className="mt-1 break-all text-amber-900">{claimUrl}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              className="rounded-lg bg-amber-800 px-3 py-1.5 text-sm font-medium text-white"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(claimUrl);
                  setCopied(true);
                } catch {
                  setCopied(false);
                }
              }}
            >
              {copied ? "Copied" : "Copy link"}
            </button>
            <button
              type="button"
              className="rounded-lg border border-amber-300 px-3 py-1.5 text-sm font-medium text-amber-950"
              onClick={() => {
                setDismissedClaimKey(claimUrl);
                setCopied(false);
              }}
            >
              Dismiss
            </button>
          </div>
        </div>
      ) : null}

      <form action={addAction} className="flex flex-col gap-2 sm:flex-row">
        <input type="hidden" name="gameId" value={gameId} />
        <input
          name="teamName"
          required
          maxLength={40}
          placeholder="New team name"
          className="flex-1 rounded-lg border border-zinc-300 px-3 py-2 text-sm"
        />
        <button
          type="submit"
          disabled={addPending}
          className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
        >
          {addPending ? "Adding…" : "Add team"}
        </button>
      </form>

      {teams.length === 0 ? (
        <p className="text-sm text-zinc-500">No teams yet.</p>
      ) : (
        <ul className="divide-y divide-zinc-200 rounded-lg border border-zinc-200">
          {teams.map((team) => (
            <li
              key={team.id}
              className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <span className="font-medium text-zinc-900">{team.name}</span>
              <div className="flex flex-wrap gap-2">
                <form action={reissueAction}>
                  <input type="hidden" name="gameId" value={gameId} />
                  <input type="hidden" name="teamId" value={team.id} />
                  <button
                    type="submit"
                    disabled={reissuePending}
                    className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-800 disabled:opacity-60"
                  >
                    New device link
                  </button>
                </form>
                <form action={removeAction}>
                  <input type="hidden" name="gameId" value={gameId} />
                  <input type="hidden" name="teamId" value={team.id} />
                  <button
                    type="submit"
                    disabled={removePending}
                    className="rounded-lg border border-red-200 px-3 py-1.5 text-sm font-medium text-red-800 disabled:opacity-60"
                    onClick={(event) => {
                      if (
                        !window.confirm(
                          `Remove ${team.name}? Their answers and score will be deleted.`,
                        )
                      ) {
                        event.preventDefault();
                      }
                    }}
                  >
                    Remove
                  </button>
                </form>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
