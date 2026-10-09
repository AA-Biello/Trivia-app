import Link from "next/link";

import { HostResumeCard } from "@/components/host-resume-card";
import { getOptionalHostSession } from "@/lib/auth/sessions";

export default async function Home() {
  const hostSession = await getOptionalHostSession();

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center gap-10 px-6 py-20">
      <div className="flex flex-col gap-3">
        <p className="text-sm font-medium uppercase tracking-wide text-amber-800">
          Pub trivia
        </p>
        <h1 className="text-4xl font-semibold tracking-tight text-zinc-900">
          Live lobby nights
        </h1>
        <p className="max-w-md text-lg text-zinc-600">
          Host a game, share a short code, and get teams into the lobby before
          the questions start.
        </p>
      </div>

      {hostSession ? (
        <HostResumeCard
          gameId={hostSession.gameId}
          title={hostSession.title}
          joinCode={hostSession.joinCode}
        />
      ) : null}

      <div className="flex flex-col gap-3 sm:flex-row">
        <Link
          href="/host"
          className="inline-flex items-center justify-center rounded-lg bg-zinc-900 px-5 py-3 text-sm font-semibold text-white hover:bg-zinc-700"
        >
          {hostSession ? "Host controls" : "Host a game"}
        </Link>
        <Link
          href="/join"
          className="inline-flex items-center justify-center rounded-lg border border-zinc-300 bg-white px-5 py-3 text-sm font-semibold text-zinc-900 hover:bg-zinc-50"
        >
          Join with a code
        </Link>
      </div>
    </main>
  );
}
