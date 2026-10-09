import Link from "next/link";

import {
  hostResumeHref,
  hostResumeLabel,
} from "@/lib/auth/host-access";

type Props = {
  gameId: string;
  title: string;
  joinCode: string;
};

/** Server-rendered resume affordance — no tokens exposed to the client. */
export function HostResumeCard({ gameId, title, joinCode }: Props) {
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-amber-200 bg-amber-50/80 px-4 py-4">
      <div className="flex flex-col gap-1">
        <p className="text-sm font-medium text-amber-900">Active host session</p>
        <p className="text-zinc-800">
          <span className="font-semibold">{title}</span>
          <span className="text-zinc-500"> · code </span>
          <span className="font-mono tracking-wider">{joinCode}</span>
        </p>
      </div>
      <Link
        href={hostResumeHref(gameId)}
        className="inline-flex items-center justify-center rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-zinc-700"
      >
        {hostResumeLabel(title)}
      </Link>
    </div>
  );
}
