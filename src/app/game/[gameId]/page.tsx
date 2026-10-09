import Link from "next/link";

import { SessionError, requireTeamSessionForGame } from "@/lib/auth/sessions";

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
        <h1 className="text-2xl font-semibold text-zinc-900">Team access denied</h1>
        <p className="text-zinc-600">{message}</p>
        <Link href="/join" className="font-medium text-amber-900 underline">
          Join a game
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto flex w-full max-w-lg flex-1 flex-col gap-8 px-6 py-16">
      <div className="flex flex-col gap-2">
        <p className="text-sm font-medium uppercase tracking-wide text-amber-800">
          {session.teamName}
        </p>
        <h1 className="text-3xl font-semibold tracking-tight text-zinc-900">
          {session.gameTitle}
        </h1>
      </div>
      <div className="rounded-xl border border-zinc-200 bg-white px-6 py-10 text-center shadow-sm">
        <p className="text-xl font-medium text-zinc-900">
          Waiting for trivia to begin
        </p>
        <p className="mt-2 text-zinc-600">
          Hang tight — the host will start the first question from their lobby.
        </p>
      </div>
    </main>
  );
}
