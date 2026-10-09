/** Pure helper: does a cookie-resolved session own the route's game? */
export function sessionOwnsGame(
  resolvedGameId: string,
  routeGameId: string,
): boolean {
  return resolvedGameId === routeGameId;
}
