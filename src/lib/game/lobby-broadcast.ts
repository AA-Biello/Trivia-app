import "server-only";

import {
  LOBBY_TEAM_JOINED_EVENT,
  lobbyChannelName,
  type LobbyTeamPayload,
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
    const result = await channel.httpSend(LOBBY_TEAM_JOINED_EVENT, team);
    if (!result.success) {
      throw new Error(
        `lobby broadcast failed (${result.status}): ${result.error}`,
      );
    }
  } finally {
    await admin.removeChannel(channel);
  }
}
