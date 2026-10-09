import Link from "next/link";
import QRCode from "qrcode";

import { HostLobbyClient } from "@/app/host/[gameId]/host-lobby-client";
import { HostResumeCard } from "@/components/host-resume-card";
import {
  SessionError,
  getOptionalHostSession,
  requireHostSessionForGame,
} from "@/lib/auth/sessions";
import { getAppOrigin, joinUrlForCode } from "@/lib/game/app-url";
import { createAdminClient } from "@/lib/supabase/admin";

type PageProps = {
  params: Promise<{ gameId: string }>;
};

export default async function HostGamePage({ params }: PageProps) {
  const { gameId } = await params;

  let session;
  try {
    session = await requireHostSessionForGame(gameId);
  } catch (error) {
    const message =
      error instanceof SessionError
        ? error.message
        : "Unable to verify host session.";
    const otherSession = await getOptionalHostSession();

    return (
      <main className="mx-auto flex w-full max-w-lg flex-1 flex-col gap-6 px-6 py-16">
        <div className="flex flex-col gap-2">
          <h1 className="text-2xl font-semibold text-zinc-900">
            Host access denied
          </h1>
          <p className="text-zinc-600">{message}</p>
        </div>
        {otherSession ? (
          <HostResumeCard
            gameId={otherSession.gameId}
            title={otherSession.title}
            joinCode={otherSession.joinCode}
          />
        ) : (
          <Link href="/host" className="font-medium text-amber-900 underline">
            Create a new game
          </Link>
        )}
      </main>
    );
  }

  const admin = createAdminClient();
  const { data: teams, error } = await admin
    .from("teams")
    .select("id, name, created_at")
    .eq("game_id", session.gameId)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("host lobby teams", error);
  }

  const origin = await getAppOrigin();
  const joinUrl = joinUrlForCode(origin, session.joinCode);
  const qrDataUrl = await QRCode.toDataURL(joinUrl, {
    margin: 1,
    width: 196,
    errorCorrectionLevel: "M",
  });

  const initialTeams = (teams ?? []).map((team) => ({
    id: team.id,
    name: team.name,
    createdAt: team.created_at,
  }));

  return (
    <HostLobbyClient
      gameId={session.gameId}
      initialTeams={initialTeams}
      joinCode={session.joinCode}
      joinUrl={joinUrl}
      qrDataUrl={qrDataUrl}
      title={session.title}
    />
  );
}
