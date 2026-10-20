import { NextResponse } from "next/server";

import { setTeamSessionCookie } from "@/lib/auth/cookies";
import { hashSessionToken } from "@/lib/auth/session-tokens";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * One-time (or reissued) device claim for a host-managed team session.
 * Sets the team cookie from the host-issued token and redirects into play.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const gameId = String(url.searchParams.get("gameId") ?? "");
  const token = String(url.searchParams.get("token") ?? "");
  const teamHint = String(url.searchParams.get("team") ?? "");

  const escape = (value: string) =>
    value
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;");

  const fail = (title: string, detail: string) =>
    new NextResponse(
      `<!doctype html><html><body style="font-family:system-ui;padding:2rem">
        <h1>${escape(title)}</h1><p>${escape(detail)}</p>
        <p><a href="/join">Join a game</a></p>
      </body></html>`,
      { status: 400, headers: { "content-type": "text/html; charset=utf-8" } },
    );

  if (!gameId || !token) {
    return fail(
      "Invalid link",
      "This device claim link is missing required information.",
    );
  }

  const admin = createAdminClient();
  const tokenHash = hashSessionToken(token);

  const { data: sessionRow } = await admin
    .from("team_sessions")
    .select("team_id")
    .eq("session_token_hash", tokenHash)
    .maybeSingle();

  if (!sessionRow) {
    return fail(
      "Link expired or invalid",
      `Ask the host to reissue a device link${teamHint ? ` for ${teamHint}` : ""}.`,
    );
  }

  const { data: team } = await admin
    .from("teams")
    .select("id, game_id, name")
    .eq("id", sessionRow.team_id)
    .maybeSingle();

  if (!team || team.game_id !== gameId) {
    return fail("Access denied", "This link does not match the game.");
  }

  await setTeamSessionCookie(token);
  return NextResponse.redirect(new URL(`/game/${gameId}`, url.origin));
}
