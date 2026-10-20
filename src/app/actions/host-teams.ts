"use server";

import { revalidatePath } from "next/cache";

import { requireHostSessionForGame } from "@/lib/auth/sessions";
import {
  generateSessionToken,
  hashSessionToken,
} from "@/lib/auth/session-tokens";
import { isUniqueViolation } from "@/lib/game/db-errors";
import { getAppOrigin } from "@/lib/game/app-url";
import {
  broadcastTeamJoined,
  broadcastTeamRemoved,
} from "@/lib/game/lobby-broadcast";
import {
  isValidTeamName,
  normalizeTeamName,
} from "@/lib/game/join-rules";
import { createAdminClient } from "@/lib/supabase/admin";

export type HostTeamActionState = {
  error?: string;
  ok?: boolean;
  /** One-time claim URL for a new/reissued team device session. */
  claimUrl?: string;
  teamName?: string;
} | null;

async function requireHost(gameId: string) {
  try {
    await requireHostSessionForGame(gameId);
    return { ok: true as const };
  } catch {
    return { ok: false as const, error: "Host session invalid for this game." };
  }
}

async function issueClaimUrl(
  gameId: string,
  teamId: string,
  teamName: string,
): Promise<{ claimUrl: string } | { error: string }> {
  const admin = createAdminClient();
  const token = generateSessionToken();
  const tokenHash = hashSessionToken(token);

  const { error } = await admin.from("team_sessions").upsert(
    {
      team_id: teamId,
      session_token_hash: tokenHash,
    },
    { onConflict: "team_id" },
  );

  if (error) {
    console.error("issueClaimUrl", error);
    return { error: "Could not create a device session." };
  }

  const origin = await getAppOrigin();
  const claimUrl = `${origin}/claim?gameId=${encodeURIComponent(gameId)}&token=${encodeURIComponent(token)}&team=${encodeURIComponent(teamName)}`;
  return { claimUrl };
}

/** Host adds a team mid-game (or lobby) and gets a one-time device claim link. */
export async function hostAddTeamAction(
  _prev: HostTeamActionState,
  formData: FormData,
): Promise<HostTeamActionState> {
  const gameId = String(formData.get("gameId") ?? "");
  const teamName = normalizeTeamName(String(formData.get("teamName") ?? ""));

  const gate = await requireHost(gameId);
  if (!gate.ok) return { error: gate.error };

  if (!isValidTeamName(teamName)) {
    return { error: "Enter a team name (1–40 characters)." };
  }

  const admin = createAdminClient();
  const { data: game } = await admin
    .from("games")
    .select("id, status")
    .eq("id", gameId)
    .maybeSingle();

  if (!game) {
    return { error: "Game not found." };
  }

  const { data: team, error: teamError } = await admin
    .from("teams")
    .insert({
      game_id: gameId,
      name: teamName,
      display_score: 0,
    })
    .select("id, name, created_at")
    .single();

  if (teamError || !team) {
    if (isUniqueViolation(teamError)) {
      return { error: "That team name is already taken in this game." };
    }
    console.error("hostAddTeam", teamError);
    return { error: "Could not add the team." };
  }

  const claim = await issueClaimUrl(gameId, team.id, team.name);
  if ("error" in claim) {
    await admin.from("teams").delete().eq("id", team.id);
    return { error: claim.error };
  }

  try {
    await broadcastTeamJoined(gameId, {
      id: team.id,
      name: team.name,
      createdAt: team.created_at,
    });
  } catch (error) {
    console.error("broadcastTeamJoined", error);
  }

  revalidatePath(`/host/${gameId}`);
  return {
    ok: true,
    claimUrl: claim.claimUrl,
    teamName: team.name,
  };
}

/** Rotate the session for an existing team (new phone). Old device loses access. */
export async function hostReissueTeamSessionAction(
  _prev: HostTeamActionState,
  formData: FormData,
): Promise<HostTeamActionState> {
  const gameId = String(formData.get("gameId") ?? "");
  const teamId = String(formData.get("teamId") ?? "");

  const gate = await requireHost(gameId);
  if (!gate.ok) return { error: gate.error };

  const admin = createAdminClient();
  const { data: team } = await admin
    .from("teams")
    .select("id, name")
    .eq("id", teamId)
    .eq("game_id", gameId)
    .maybeSingle();

  if (!team) {
    return { error: "Team not found for this game." };
  }

  const claim = await issueClaimUrl(gameId, team.id, team.name);
  if ("error" in claim) {
    return { error: claim.error };
  }

  revalidatePath(`/host/${gameId}`);
  return {
    ok: true,
    claimUrl: claim.claimUrl,
    teamName: team.name,
  };
}

/** Remove a team and its session from the game. */
export async function hostRemoveTeamAction(
  _prev: HostTeamActionState,
  formData: FormData,
): Promise<HostTeamActionState> {
  const gameId = String(formData.get("gameId") ?? "");
  const teamId = String(formData.get("teamId") ?? "");

  const gate = await requireHost(gameId);
  if (!gate.ok) return { error: gate.error };

  const admin = createAdminClient();
  const { data: team } = await admin
    .from("teams")
    .select("id, name")
    .eq("id", teamId)
    .eq("game_id", gameId)
    .maybeSingle();

  if (!team) {
    return { error: "Team not found for this game." };
  }

  const { error } = await admin.from("teams").delete().eq("id", teamId);
  if (error) {
    console.error("hostRemoveTeam", error);
    return { error: "Could not remove the team." };
  }

  try {
    await broadcastTeamRemoved(gameId, { id: teamId });
  } catch (broadcastError) {
    console.error("broadcastTeamRemoved", broadcastError);
  }

  revalidatePath(`/host/${gameId}`);
  revalidatePath(`/game/${gameId}`);
  return { ok: true, teamName: team.name };
}
