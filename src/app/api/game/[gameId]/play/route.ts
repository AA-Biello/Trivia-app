import { SessionError, requireTeamSessionForGame } from "@/lib/auth/sessions";
import { loadTeamPlaySnapshot } from "@/lib/game/play-state";

type RouteContext = {
  params: Promise<{ gameId: string }>;
};

/**
 * Lightweight team play snapshot for client polling / reconnect sync.
 * Auth via HttpOnly team session cookie — never trusts client team ids.
 */
export async function GET(_request: Request, context: RouteContext) {
  const { gameId } = await context.params;

  try {
    const session = await requireTeamSessionForGame(gameId);
    const snapshot = await loadTeamPlaySnapshot(
      session.gameId,
      session.teamId,
      session.gameTitle,
      session.teamName,
    );
    return Response.json(snapshot, {
      headers: {
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    if (error instanceof SessionError) {
      return Response.json({ error: error.message }, { status: 401 });
    }
    console.error("play snapshot", error);
    return Response.json({ error: "Unable to load play state." }, { status: 500 });
  }
}
