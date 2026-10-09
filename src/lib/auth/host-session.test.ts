import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  HOST_SESSION_COOKIE,
  TEAM_SESSION_COOKIE,
} from "@/lib/auth/cookie-names";
import {
  createMemoryCookieJar,
  memoryReadHostSession,
  memoryReadTeamSession,
  memorySetHostSession,
  memorySetTeamSession,
} from "@/lib/auth/cookie-jar";
import { sessionCookieOptions } from "@/lib/auth/cookie-options";
import {
  denyHostAccessReason,
  hostResumeHref,
  hostResumeLabel,
} from "@/lib/auth/host-access";
import { hashSessionToken } from "@/lib/auth/token-crypto";

const gameA = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const gameB = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

describe("host cookie configuration", () => {
  it("uses distinct host/team names and app-wide path", () => {
    assert.notEqual(HOST_SESSION_COOKIE, TEAM_SESSION_COOKIE);
    const options = sessionCookieOptions(0);
    assert.equal(options.path, "/");
    assert.equal(options.httpOnly, true);
    assert.equal(options.sameSite, "lax");
    assert.equal(options.maxAge, 60 * 60 * 24);
  });
});

describe("team session cookie does not overwrite host session cookie", () => {
  it("keeps the host token when a team session is set", () => {
    const jar = createMemoryCookieJar();
    memorySetHostSession(jar, "host-token-raw");
    memorySetTeamSession(jar, "team-token-raw");

    assert.equal(memoryReadHostSession(jar), "host-token-raw");
    assert.equal(memoryReadTeamSession(jar), "team-token-raw");
    assert.equal(jar.has(HOST_SESSION_COOKIE), true);
    assert.equal(jar.has(TEAM_SESSION_COOKIE), true);
  });
});

describe("host creates game → navigates home → resumes same game", () => {
  it("resume link targets the cookie-resolved game id", () => {
    const jar = createMemoryCookieJar();
    const hostToken = "host-session-for-game-a";
    memorySetHostSession(jar, hostToken);

    // Lookup would hash the cookie and find game A (simulated).
    const resolvedGameId = gameA;
    assert.equal(memoryReadHostSession(jar), hostToken);
    assert.equal(hostResumeHref(resolvedGameId), `/host/${gameA}`);
    assert.equal(hostResumeLabel("Test Game"), "Resume Test Game");
    assert.equal(
      denyHostAccessReason({
        hasCookie: true,
        resolvedGameId,
        routeGameId: gameA,
      }),
      null,
    );
  });

  it("creating a second host session replaces the cookie (MVP single session)", () => {
    const jar = createMemoryCookieJar();
    memorySetHostSession(jar, "token-game-a");
    memorySetHostSession(jar, "token-game-b");
    assert.equal(memoryReadHostSession(jar), "token-game-b");
    assert.equal(
      denyHostAccessReason({
        hasCookie: true,
        resolvedGameId: gameB,
        routeGameId: gameA,
      }),
      "host_game_mismatch",
    );
  });
});

describe("host refreshes lobby → still authorized", () => {
  it("same cookie + same route game remains allowed", () => {
    assert.equal(
      denyHostAccessReason({
        hasCookie: true,
        resolvedGameId: gameA,
        routeGameId: gameA,
      }),
      null,
    );
  });
});

describe("missing host cookie → access denied", () => {
  it("denies when the host cookie is absent", () => {
    assert.equal(
      denyHostAccessReason({
        hasCookie: false,
        resolvedGameId: null,
        routeGameId: gameA,
      }),
      "missing_host_session",
    );
  });
});

describe("invalid host token → access denied", () => {
  it("denies when cookie is present but game_hosts lookup fails", () => {
    const token = "forged-or-stale-token";
    const hash = hashSessionToken(token);
    assert.ok(hash.length > 0);
    assert.equal(
      denyHostAccessReason({
        hasCookie: true,
        resolvedGameId: null,
        routeGameId: gameA,
      }),
      "invalid_host_session",
    );
  });
});

describe("valid host token for Game A cannot access Game B", () => {
  it("denies cross-game host access without weakening authz", () => {
    assert.equal(
      denyHostAccessReason({
        hasCookie: true,
        resolvedGameId: gameA,
        routeGameId: gameB,
      }),
      "host_game_mismatch",
    );
  });
});
