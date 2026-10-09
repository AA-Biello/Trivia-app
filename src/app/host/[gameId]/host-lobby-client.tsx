"use client";

import { useEffect, useState } from "react";

import { createClient } from "@/lib/supabase/client";
import {
  LOBBY_TEAM_JOINED_EVENT,
  lobbyChannelName,
  type LobbyTeamPayload,
} from "@/lib/game/lobby-channel";

type Props = {
  gameId: string;
  initialTeams: LobbyTeamPayload[];
  joinCode: string;
  joinUrl: string;
  qrDataUrl: string;
  title: string;
};

export function HostLobbyClient({
  gameId,
  initialTeams,
  joinCode,
  joinUrl,
  qrDataUrl,
  title,
}: Props) {
  const [teams, setTeams] = useState(initialTeams);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(lobbyChannelName(gameId))
      .on(
        "broadcast",
        { event: LOBBY_TEAM_JOINED_EVENT },
        ({ payload }) => {
          const team = payload as LobbyTeamPayload;
          if (!team?.id || !team.name) {
            return;
          }
          setTeams((current) => {
            if (current.some((row) => row.id === team.id)) {
              return current;
            }
            return [...current, team].sort((a, b) =>
              a.createdAt.localeCompare(b.createdAt),
            );
          });
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [gameId]);

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-10 px-6 py-12">
      <header className="flex flex-col gap-2">
        <p className="text-sm font-medium uppercase tracking-wide text-amber-800">
          Host lobby
        </p>
        <h1 className="text-3xl font-semibold tracking-tight text-zinc-900">
          {title}
        </h1>
        <p className="text-zinc-600">
          Share the code or QR so teams can join. The list updates live.
        </p>
      </header>

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
          <p className="rounded-lg border border-dashed border-zinc-300 px-4 py-8 text-center text-zinc-500">
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
                <span className="text-xs text-zinc-400">
                  {new Date(team.createdAt).toLocaleTimeString()}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
