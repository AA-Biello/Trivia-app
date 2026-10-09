import Link from "next/link";

import { JoinForm } from "@/app/join/join-form";
import { normalizeJoinCode } from "@/lib/game/join-code";

type PageProps = {
  params: Promise<{ code: string }>;
};

export default async function JoinWithCodePage({ params }: PageProps) {
  const { code } = await params;
  const initialCode = normalizeJoinCode(code);

  return (
    <main className="mx-auto flex w-full max-w-lg flex-1 flex-col gap-8 px-6 py-16">
      <div className="flex flex-col gap-2">
        <p className="text-sm font-medium uppercase tracking-wide text-amber-800">
          Team
        </p>
        <h1 className="text-3xl font-semibold tracking-tight text-zinc-900">
          Join {initialCode || "game"}
        </h1>
        <p className="text-zinc-600">
          Confirm the code and choose a team name that isn&apos;t already taken.
        </p>
      </div>
      <JoinForm initialCode={initialCode} />
      <p className="text-sm text-zinc-500">
        Wrong link?{" "}
        <Link href="/join" className="font-medium text-zinc-900 underline">
          Enter a code manually
        </Link>
      </p>
    </main>
  );
}
