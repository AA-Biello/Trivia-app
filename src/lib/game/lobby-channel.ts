/** Public Realtime Broadcast topic for lobby roster updates (no DB secrets). */
export function lobbyChannelName(gameId: string): string {
  return `lobby:${gameId}`;
}

export const LOBBY_TEAM_JOINED_EVENT = "team_joined";

export type LobbyTeamPayload = {
  id: string;
  name: string;
  createdAt: string;
};
