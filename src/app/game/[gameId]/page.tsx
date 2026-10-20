import Link from "next/link";

import { TeamPlayClient } from "@/app/game/[gameId]/team-play-client";
import { SessionError, requireTeamSessionForGame } from "@/lib/auth/sessions";
import { loadTeamPlaySnapshot } from "@/lib/game/play-state";

type PageProps = {
  params: Promise<{ gameId: string }>;
};

export default async function TeamGamePage({ params }: PageProps) {
  const { gameId } = await params;

  let session;
  try {
    session = await requireTeamSessionForGame(gameId);
  } catch (error) {
    const message =
      error instanceof SessionError
        ? error.message
        : "Unable to verify team session.";
    return (
      <main className="mx-auto flex w-full max-w-lg flex-1 flex-col gap-4 px-6 py-16">
        <h1 className="text-2xl font-semibold text-zinc-900">
          Team access denied
        </h1>
        <p className="text-zinc-600">{message}</p>
        <Link href="/join" className="font-medium text-amber-900 underline">
          Join a game
        </Link>
      </main>
    );
  }

  const snapshot = await loadTeamPlaySnapshot(
    session.gameId,
    session.teamId,
    session.gameTitle,
    session.teamName,
  );

  return (
    <TeamPlayClient gameId={session.gameId} initial={snapshot} />
  );
}
