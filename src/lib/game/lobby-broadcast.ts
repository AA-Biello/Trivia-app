import "server-only";

import {
  LOBBY_TEAM_JOINED_EVENT,
  LOBBY_TEAM_REMOVED_EVENT,
  lobbyChannelName,
  type LobbyTeamPayload,
  type LobbyTeamRemovedPayload,
} from "@/lib/game/lobby-channel";
import { createAdminClient } from "@/lib/supabase/admin";

/** Notify host lobby clients via Realtime Broadcast (no table SELECT / RLS change). */
export async function broadcastTeamJoined(
  gameId: string,
  team: LobbyTeamPayload,
): Promise<void> {
  const admin = createAdminClient();
  const channel = admin.channel(lobbyChannelName(gameId));

  try {
    await channel.send({
      type: "broadcast",
      event: LOBBY_TEAM_JOINED_EVENT,
      payload: team,
    });
  } finally {
    await admin.removeChannel(channel);
  }
}

export async function broadcastTeamRemoved(
  gameId: string,
  payload: LobbyTeamRemovedPayload,
): Promise<void> {
  const admin = createAdminClient();
  const channel = admin.channel(lobbyChannelName(gameId));

  try {
    await channel.send({
      type: "broadcast",
      event: LOBBY_TEAM_REMOVED_EVENT,
      payload,
    });
  } finally {
    await admin.removeChannel(channel);
  }
}
