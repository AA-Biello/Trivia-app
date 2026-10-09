"use server";

import { redirect } from "next/navigation";

import { setHostSessionCookie } from "@/lib/auth/cookies";
import {
  generateSessionToken,
  hashSessionToken,
} from "@/lib/auth/session-tokens";
import { isUniqueViolation } from "@/lib/game/db-errors";
import { generateSecureJoinCode } from "@/lib/game/join-code-server";
import { createAdminClient } from "@/lib/supabase/admin";

export type CreateGameState = {
  error: string;
} | null;

export async function createGameAction(
  _prev: CreateGameState,
  formData: FormData,
): Promise<CreateGameState> {
  const title = String(formData.get("title") ?? "").trim();
  if (!title) {
    return { error: "Enter a game name." };
  }
  if (title.length > 80) {
    return { error: "Game name must be 80 characters or fewer." };
  }

  const admin = createAdminClient();
  const hostToken = generateSessionToken();
  const hostTokenHash = hashSessionToken(hostToken);

  let gameId: string | null = null;

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const joinCode = generateSecureJoinCode();

    const { data: game, error: gameError } = await admin
      .from("games")
      .insert({
        title,
        join_code: joinCode,
        status: "LOBBY",
      })
      .select("id")
      .single();

    if (gameError) {
      if (isUniqueViolation(gameError)) {
        continue;
      }
      console.error("createGame game insert", gameError);
      return { error: "Could not create the game. Try again." };
    }

    gameId = game.id;

    const { error: hostError } = await admin.from("game_hosts").insert({
      game_id: game.id,
      host_token_hash: hostTokenHash,
    });

    if (hostError) {
      await admin.from("games").delete().eq("id", game.id);
      console.error("createGame host insert", hostError);
      return { error: "Could not create the host session. Try again." };
    }

    break;
  }

  if (!gameId) {
    return { error: "Could not allocate a unique join code. Try again." };
  }

  await setHostSessionCookie(hostToken);
  redirect(`/host/${gameId}`);
}
