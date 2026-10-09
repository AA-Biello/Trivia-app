import Link from "next/link";

import { JoinForm } from "@/app/join/join-form";

export default function JoinPage() {
  return (
    <main className="mx-auto flex w-full max-w-lg flex-1 flex-col gap-8 px-6 py-16">
      <div className="flex flex-col gap-2">
        <p className="text-sm font-medium uppercase tracking-wide text-amber-800">
          Team
        </p>
        <h1 className="text-3xl font-semibold tracking-tight text-zinc-900">
          Join a game
        </h1>
        <p className="text-zinc-600">
          Enter the code from the host screen and pick a unique team name.
        </p>
      </div>
      <JoinForm />
      <p className="text-sm text-zinc-500">
        Hosting instead?{" "}
        <Link href="/host" className="font-medium text-zinc-900 underline">
          Create a game
        </Link>
      </p>
    </main>
  );
}
