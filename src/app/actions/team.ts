"use server";

import { redirect } from "next/navigation";

import { setTeamSessionCookie } from "@/lib/auth/cookies";
import {
  generateSessionToken,
  hashSessionToken,
} from "@/lib/auth/session-tokens";
import {
  isValidJoinCodeFormat,
  normalizeJoinCode,
} from "@/lib/game/join-code";
import {
  canAcceptTeamJoins,
  isValidTeamName,
  normalizeTeamName,
} from "@/lib/game/join-rules";
import { isUniqueViolation } from "@/lib/game/db-errors";
import { broadcastTeamJoined } from "@/lib/game/lobby-broadcast";
import { createAdminClient } from "@/lib/supabase/admin";
import type { GameStatus } from "@/types/game";

export type JoinGameState = {
  error: string;
} | null;

export async function joinGameAction(
  _prev: JoinGameState,
  formData: FormData,
): Promise<JoinGameState> {
  const joinCode = normalizeJoinCode(String(formData.get("joinCode") ?? ""));
  const teamName = normalizeTeamName(String(formData.get("teamName") ?? ""));

  if (!isValidJoinCodeFormat(joinCode)) {
    return { error: "Enter a valid 6-character game code." };
  }
  if (!isValidTeamName(teamName)) {
    return { error: "Enter a team name (1–40 characters)." };
  }

  const admin = createAdminClient();

  const { data: game, error: gameError } = await admin
    .from("games")
    .select("id, status, title")
    .eq("join_code", joinCode)
    .maybeSingle();

  if (gameError) {
    console.error("joinGame lookup", gameError);
    return { error: "Could not look up that game. Try again." };
  }
  if (!game) {
    return { error: "No game found for that code." };
  }
  if (!canAcceptTeamJoins(game.status as GameStatus)) {
    return { error: "This game is not accepting new teams right now." };
  }

  const teamToken = generateSessionToken();
  const teamTokenHash = hashSessionToken(teamToken);

  const { data: team, error: teamError } = await admin
    .from("teams")
    .insert({
      game_id: game.id,
      name: teamName,
      display_score: 0,
    })
    .select("id, name, created_at")
    .single();

  if (teamError) {
    if (isUniqueViolation(teamError)) {
      return { error: "That team name is already taken in this game." };
    }
    console.error("joinGame team insert", teamError);
    return { error: "Could not join the game. Try again." };
  }

  const { error: sessionError } = await admin.from("team_sessions").insert({
    team_id: team.id,
    session_token_hash: teamTokenHash,
  });

  if (sessionError) {
    await admin.from("teams").delete().eq("id", team.id);
    console.error("joinGame session insert", sessionError);
    return { error: "Could not create your team session. Try again." };
  }

  await setTeamSessionCookie(teamToken);

  try {
    await broadcastTeamJoined(game.id, {
      id: team.id,
      name: team.name,
      createdAt: team.created_at,
    });
  } catch (error) {
    // Join succeeded; lobby can refresh manually if broadcast fails.
    console.error("joinGame broadcast", error);
  }

  redirect(`/game/${game.id}`);
}
