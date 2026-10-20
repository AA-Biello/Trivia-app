import Link from "next/link";
import QRCode from "qrcode";

import { HostConsole } from "@/app/host/[gameId]/host-console";
import { HostResumeCard } from "@/components/host-resume-card";
import {
  SessionError,
  getOptionalHostSession,
  requireHostSessionForGame,
} from "@/lib/auth/sessions";
import { getAppOrigin, joinUrlForCode } from "@/lib/game/app-url";
import {
  loadHostFinalSnapshot,
  loadPublishedFinalResults,
} from "@/lib/game/final-state";
import {
  loadHostGradingQuestions,
  loadHostRevealSnapshot,
} from "@/lib/game/grade-state";
import { loadHostPlaySnapshot } from "@/lib/game/play-state";
import { loadHostRoundList } from "@/lib/game/round-state";
import { loadPublishedScoreboard } from "@/lib/game/scoreboard-state";
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
  const [{ data: teams, error }, play, rounds] = await Promise.all([
    admin
      .from("teams")
      .select("id, name, created_at")
      .eq("game_id", session.gameId)
      .order("created_at", { ascending: true }),
    loadHostPlaySnapshot(session.gameId),
    loadHostRoundList(session.gameId),
  ]);

  if (error) {
    console.error("host lobby teams", error);
  }

  const needsGrading =
    play.status === "ROUND_BREAK" ||
    play.status === "ROUND_REVIEW" ||
    play.status === "REVEAL" ||
    play.status === "RESULTS_PUBLISHED" ||
    play.status === "SCOREBOARD";

  const gradingQuestions =
    needsGrading && play.round
      ? await loadHostGradingQuestions(session.gameId, play.round.id)
      : [];

  const revealSnapshot =
    play.status === "REVEAL"
      ? await loadHostRevealSnapshot(session.gameId)
      : null;

  const scoreboard =
    play.status === "SCOREBOARD"
      ? await loadPublishedScoreboard(session.gameId, play.round?.id ?? null)
      : null;

  const finalSnapshot =
    play.status === "FINAL_QUESTION" ||
    play.status === "FINAL_REVIEW" ||
    play.status === "FINAL_RESULTS" ||
    play.status === "GAME_OVER"
      ? await loadHostFinalSnapshot(session.gameId)
      : null;

  const finalResults =
    play.status === "FINAL_RESULTS" || play.status === "GAME_OVER"
      ? await loadPublishedFinalResults(session.gameId)
      : null;

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
    <HostConsole
      gameId={session.gameId}
      title={session.title}
      joinCode={session.joinCode}
      joinUrl={joinUrl}
      qrDataUrl={qrDataUrl}
      initialTeams={initialTeams}
      initialPlay={play}
      gradingQuestions={gradingQuestions}
      revealSnapshot={revealSnapshot}
      scoreboard={scoreboard}
      finalSnapshot={finalSnapshot}
      finalResults={finalResults}
      rounds={rounds}
    />
  );
}
