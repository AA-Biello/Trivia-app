import "server-only";

import {
  ANSWER_PROGRESS_EVENT,
  GAME_STATE_EVENT,
  WAGER_PROGRESS_EVENT,
  playChannelName,
  type AnswerProgressPayload,
  type PublicGameStatePayload,
  type WagerProgressPayload,
} from "@/lib/game/play-channel";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Server-side broadcast via REST. Does not require a subscribed WebSocket
 * (important on Vercel / short-lived server actions).
 */
async function broadcast(
  gameId: string,
  event: string,
  payload: Record<string, unknown>,
): Promise<void> {
  const admin = createAdminClient();
  const channel = admin.channel(playChannelName(gameId));
  try {
    const result = await channel.httpSend(event, payload);
    if (!result.success) {
      throw new Error(
        `broadcast ${event} failed (${result.status}): ${result.error}`,
      );
    }
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

export async function broadcastWagerProgress(
  gameId: string,
  progress: WagerProgressPayload,
): Promise<void> {
  await broadcast(gameId, WAGER_PROGRESS_EVENT, progress);
}
