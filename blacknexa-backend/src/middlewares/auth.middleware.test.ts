/**
 * Unit tests for `optionalAuth`'s one refusal — `npm test`. Review R12.
 *
 * `optionalAuth` reads a caller as anonymous for any token it cannot use, except
 * a genuine member access token that has merely expired: that answers 401 with
 * the legacy envelope, so the mobile client (which refreshes only on a 401)
 * refreshes and replays instead of showing an author a 404 on their own
 * pending, held or rejected report.
 *
 * This middleware reads the JWT secret from the environment, so — unlike the
 * pure-module tests — this file sets what `env.config` requires before loading
 * it (it exits the process otherwise): the two JWT secrets, and a database URL
 * pointing at a closed local port, so that even a stray query could never reach
 * a real database. No case here reaches the session lookup.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import jwt from "jsonwebtoken";
import type { NextFunction, Request, RequestHandler, Response } from "express";

const SECRET = "r12-test-access-secret-0123456789abcdef-0123456789";
const OTHER_SECRET = "r12-some-other-secret-0123456789abcdef-0123456789";
process.env.JWT_ACCESS_SECRET = SECRET;
process.env.JWT_REFRESH_SECRET = "r12-test-refresh-secret-0123456789abcdef-012345";
// Set before `env.config` loads `.env`, which never overrides what is already set.
process.env.DATABASE_URL = "postgres://unit:unit@127.0.0.1:1/unit_tests_never_connect";

interface AuthModule {
  optionalAuth: RequestHandler;
  isExpiredMemberAccessToken: (token: string, secret: string, nowMs?: number) => boolean;
}

let loaded: Promise<AuthModule> | null = null;
function load(): Promise<AuthModule> {
  // Loaded after the environment above is in place — a static import would be
  // hoisted above it.
  loaded ??= import("./auth.middleware") as Promise<AuthModule>;
  return loaded;
}

const nowSeconds = (): number => Math.floor(Date.now() / 1000);

function token(
  claims: Record<string, unknown>,
  options: { secret?: string; expiredBy?: number } = {},
): string {
  const exp = options.expiredBy === undefined ? nowSeconds() + 900 : nowSeconds() - options.expiredBy;
  return jwt.sign(
    {
      sub: "11111111-1111-4111-8111-111111111111",
      email: "author@example.org",
      role: "member",
      aud: "user",
      typ: "access",
      sid: "22222222-2222-4222-8222-222222222222",
      exp,
      ...claims,
    },
    options.secret ?? SECRET,
  );
}

interface Captured {
  status: number | null;
  body: unknown;
  nextCalled: boolean;
  user: unknown;
}

async function run(authorization: string | undefined): Promise<Captured> {
  const { optionalAuth } = await load();
  const captured: Captured = { status: null, body: null, nextCalled: false, user: undefined };
  const req = { headers: authorization ? { authorization } : {} } as unknown as Request;
  const res = {
    status(code: number) {
      captured.status = code;
      return this;
    },
    json(body: unknown) {
      captured.body = body;
      return this;
    },
  } as unknown as Response;
  const next: NextFunction = () => {
    captured.nextCalled = true;
  };
  await optionalAuth(req, res, next);
  captured.user = (req as { user?: unknown }).user;
  return captured;
}

test("isExpiredMemberAccessToken: only a genuine member access token past its exp", async () => {
  const { isExpiredMemberAccessToken } = await load();
  assert.equal(isExpiredMemberAccessToken(token({}, { expiredBy: 60 }), SECRET), true);
  // Still valid: not this case at all.
  assert.equal(isExpiredMemberAccessToken(token({}), SECRET), false);
  // An operator token, a refresh token, a forged token: never.
  assert.equal(isExpiredMemberAccessToken(token({ aud: "admin" }, { expiredBy: 60 }), SECRET), false);
  assert.equal(isExpiredMemberAccessToken(token({ typ: "refresh" }, { expiredBy: 60 }), SECRET), false);
  assert.equal(
    isExpiredMemberAccessToken(token({}, { expiredBy: 60, secret: OTHER_SECRET }), SECRET),
    false,
  );
  assert.equal(isExpiredMemberAccessToken("not-a-jwt", SECRET), false);
  // Not yet valid is a different defect, not an expiry.
  assert.equal(
    isExpiredMemberAccessToken(token({ nbf: nowSeconds() + 3600 }, { expiredBy: 60 }), SECRET),
    false,
  );
});

test("R12: an expired member token gets 401 with the legacy envelope, so the client refreshes", async () => {
  const result = await run(`Bearer ${token({}, { expiredBy: 60 })}`);
  assert.equal(result.status, 401);
  assert.deepEqual(result.body, { success: false, error: "Access token has expired." });
  assert.equal(result.nextCalled, false);
  assert.equal(result.user, undefined);
});

test("R12: every other unusable token still reads as anonymous", async () => {
  const cases: Array<[string, string | undefined]> = [
    ["no header", undefined],
    ["not a bearer header", "Basic abc"],
    ["garbage", "Bearer not-a-jwt"],
    ["forged and expired", `Bearer ${token({}, { expiredBy: 60, secret: OTHER_SECRET })}`],
    ["expired operator token", `Bearer ${token({ aud: "admin" }, { expiredBy: 60 })}`],
    ["expired refresh-typed token", `Bearer ${token({ typ: "refresh" }, { expiredBy: 60 })}`],
  ];
  for (const [label, header] of cases) {
    const result = await run(header);
    assert.equal(result.status, null, label);
    assert.equal(result.nextCalled, true, label);
    assert.equal(result.user, undefined, label);
  }
});
