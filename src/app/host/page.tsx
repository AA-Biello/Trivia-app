import Link from "next/link";

import { CreateGameForm } from "@/app/host/create-game-form";
import { HostResumeCard } from "@/components/host-resume-card";
import { getOptionalHostSession } from "@/lib/auth/sessions";

export default async function HostPage() {
  const hostSession = await getOptionalHostSession();

  return (
    <main className="mx-auto flex w-full max-w-lg flex-1 flex-col gap-8 px-6 py-16">
      <div className="flex flex-col gap-2">
        <p className="text-sm font-medium uppercase tracking-wide text-amber-800">
          Host
        </p>
        <h1 className="text-3xl font-semibold tracking-tight text-zinc-900">
          {hostSession ? "Your trivia night" : "Start a trivia night"}
        </h1>
        <p className="text-zinc-600">
          {hostSession
            ? "Resume your lobby, or create a new game (this browser keeps one host session)."
            : "Create a lobby, share the join code, and wait for teams to arrive."}
        </p>
      </div>

      {hostSession ? (
        <HostResumeCard
          gameId={hostSession.gameId}
          title={hostSession.title}
          joinCode={hostSession.joinCode}
        />
      ) : null}

      <div className="flex flex-col gap-3">
        {hostSession ? (
          <p className="text-sm font-medium text-zinc-700">Create a new game</p>
        ) : null}
        <CreateGameForm
          submitLabel={hostSession ? "Create new game" : "Create game"}
          replaceSessionWarning={Boolean(hostSession)}
        />
      </div>

      <p className="text-sm text-zinc-500">
        Joining as a team instead?{" "}
        <Link href="/join" className="font-medium text-zinc-900 underline">
          Enter a game code
        </Link>
      </p>
    </main>
  );
}
