import "server-only";

import {
  readHostSessionToken,
  readTeamSessionToken,
} from "@/lib/auth/cookies";
import { sessionOwnsGame } from "@/lib/auth/ownership";
import { hashSessionToken } from "@/lib/auth/session-tokens";
import { createAdminClient } from "@/lib/supabase/admin";

export type HostSession = {
  gameId: string;
  title: string;
  joinCode: string;
  status: string;
};

export type TeamSession = {
  teamId: string;
  teamName: string;
  gameId: string;
  gameTitle: string;
  gameStatus: string;
  joinCode: string;
};

export class SessionError extends Error {
  constructor(
    message: string,
    readonly code:
      | "missing_host_session"
      | "invalid_host_session"
      | "host_game_mismatch"
      | "missing_team_session"
      | "invalid_team_session"
      | "team_game_mismatch",
  ) {
    super(message);
    this.name = "SessionError";
  }
}

/**
 * Resolve the host from the HttpOnly session cookie.
 * Never trusts a client-supplied gameId for authorization — callers must
 * compare the resolved gameId to the route param after this returns.
 */
async function resolveHostSessionFromToken(
  token: string,
): Promise<HostSession | null> {
  const tokenHash = hashSessionToken(token);
  const admin = createAdminClient();

  const { data: hostRow, error: hostError } = await admin
    .from("game_hosts")
    .select("game_id")
    .eq("host_token_hash", tokenHash)
    .maybeSingle();

  if (hostError || !hostRow) {
    return null;
  }

  const { data: game, error: gameError } = await admin
    .from("games")
    .select("id, title, join_code, status")
    .eq("id", hostRow.game_id)
    .maybeSingle();

  if (gameError || !game) {
    return null;
  }

  return {
    gameId: game.id,
    title: game.title,
    joinCode: game.join_code,
    status: game.status,
  };
}

/**
 * Non-throwing host session lookup for resume UI on / and /host.
 * Never returns the raw token or token hash.
 */
export async function getOptionalHostSession(): Promise<HostSession | null> {
  const token = await readHostSessionToken();
  if (!token) {
    return null;
  }
  return resolveHostSessionFromToken(token);
}

export async function requireHostSession(): Promise<HostSession> {
  const token = await readHostSessionToken();
  if (!token) {
    throw new SessionError(
      "Host session missing or expired. Create a game again.",
      "missing_host_session",
    );
  }

  const session = await resolveHostSessionFromToken(token);
  if (!session) {
    throw new SessionError(
      "Host session is invalid or expired.",
      "invalid_host_session",
    );
  }

  return session;
}

export async function requireHostSessionForGame(
  gameId: string,
): Promise<HostSession> {
  const session = await requireHostSession();
  if (!sessionOwnsGame(session.gameId, gameId)) {
    throw new SessionError(
      "You are not the host of this game.",
      "host_game_mismatch",
    );
  }
  return session;
}

/**
 * Resolve the team from the HttpOnly session cookie.
 * Never trusts a client-supplied teamId/gameId for authorization.
 */
export async function requireTeamSession(): Promise<TeamSession> {
  const token = await readTeamSessionToken();
  if (!token) {
    throw new SessionError(
      "Team session missing or expired. Join the game again.",
      "missing_team_session",
    );
  }

  const tokenHash = hashSessionToken(token);
  const admin = createAdminClient();

  const { data: sessionRow, error: sessionError } = await admin
    .from("team_sessions")
    .select("team_id")
    .eq("session_token_hash", tokenHash)
    .maybeSingle();

  if (sessionError || !sessionRow) {
    throw new SessionError(
      "Team session is invalid or expired.",
      "invalid_team_session",
    );
  }

  const { data: team, error: teamError } = await admin
    .from("teams")
    .select("id, name, game_id")
    .eq("id", sessionRow.team_id)
    .maybeSingle();

  if (teamError || !team) {
    throw new SessionError(
      "Team session is invalid or expired.",
      "invalid_team_session",
    );
  }

  const { data: game, error: gameError } = await admin
    .from("games")
    .select("id, title, join_code, status")
    .eq("id", team.game_id)
    .maybeSingle();

  if (gameError || !game) {
    throw new SessionError(
      "Team session is invalid or expired.",
      "invalid_team_session",
    );
  }

  return {
    teamId: team.id,
    teamName: team.name,
    gameId: game.id,
    gameTitle: game.title,
    gameStatus: game.status,
    joinCode: game.join_code,
  };
}

export async function requireTeamSessionForGame(
  gameId: string,
): Promise<TeamSession> {
  const session = await requireTeamSession();
  if (!sessionOwnsGame(session.gameId, gameId)) {
    throw new SessionError(
      "You are not a team in this game.",
      "team_game_mismatch",
    );
  }
  return session;
}
