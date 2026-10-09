import "server-only";

import {
  ANSWER_PROGRESS_EVENT,
  GAME_STATE_EVENT,
  playChannelName,
  type AnswerProgressPayload,
  type PublicGameStatePayload,
} from "@/lib/game/play-channel";
import { createAdminClient } from "@/lib/supabase/admin";

async function broadcast(
  gameId: string,
  event: string,
  payload: Record<string, unknown>,
): Promise<void> {
  const admin = createAdminClient();
  const channel = admin.channel(playChannelName(gameId));
  try {
    await channel.send({
      type: "broadcast",
      event,
      payload,
    });
  } finally {
    await admin.removeChannel(channel);
  }
}

export async function broadcastGameState(
  gameId: string,
  state: PublicGameStatePayload,
): Promise<void> {
  await broadcast(gameId, GAME_STATE_EVENT, state);
}

export async function broadcastAnswerProgress(
  gameId: string,
  progress: AnswerProgressPayload,
): Promise<void> {
  await broadcast(gameId, ANSWER_PROGRESS_EVENT, progress);
}
