/**
 * Unit tests for the worker's retry timing — `npm test`, with a fake clock.
 *
 * docs/INCIDENT_MODULE_PLAN.md §5.2: the circuit breaker (5 consecutive
 * retryable failures → 30 s open, half-open after), the retry delay (backoff,
 * or immediately to the terminal path when the budget is spent) and the parking
 * delay while the breaker is open.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { BREAKER, CircuitBreaker, breakerDelayMs, retryDelayMs } from "./moderation_breaker";

function clock(start = 1_000_000) {
  let now = start;
  return {
    now: () => now,
    advance: (ms: number) => {
      now += ms;
    },
  };
}

test("breaker: closed until five consecutive retryable failures", () => {
  const time = clock();
  const breaker = new CircuitBreaker(time.now);
  for (let i = 1; i < BREAKER.failureThreshold; i += 1) {
    assert.equal(breaker.recordFailure(), false);
    assert.equal(breaker.isOpen(), false);
  }
  assert.equal(breaker.recordFailure(), true);
  assert.equal(breaker.isOpen(), true);
  assert.equal(breaker.openUntil, time.now() + BREAKER.openMs);
});

test("breaker: a success in between resets the count", () => {
  const time = clock();
  const breaker = new CircuitBreaker(time.now);
  for (let i = 0; i < 4; i += 1) breaker.recordFailure();
  breaker.recordSuccess();
  assert.equal(breaker.failures, 0);
  for (let i = 0; i < 4; i += 1) breaker.recordFailure();
  assert.equal(breaker.isOpen(), false);
});

test("breaker: open for 30 s, then half-open — one failure re-opens it, a success closes it", () => {
  const time = clock();
  const breaker = new CircuitBreaker(time.now);
  for (let i = 0; i < 5; i += 1) breaker.recordFailure();
  time.advance(BREAKER.openMs - 1);
  assert.equal(breaker.isOpen(), true);
  time.advance(1);
  assert.equal(breaker.isOpen(), false);

  // Half-open: the very next failure re-opens it.
  assert.equal(breaker.recordFailure(), true);
  assert.equal(breaker.isOpen(), true);

  time.advance(BREAKER.openMs);
  breaker.recordSuccess();
  assert.equal(breaker.isOpen(), false);
  assert.equal(breaker.openUntil, 0);
  assert.equal(breaker.recordFailure(), false);
});

test("retryDelayMs: the §5.2 backoff while attempts remain", () => {
  const mid = () => 0.5; // no jitter
  assert.equal(retryDelayMs(1, 4, mid), 15_000);
  assert.equal(retryDelayMs(2, 4, mid), 60_000);
  assert.equal(retryDelayMs(3, 4, mid), 240_000);
});

test("retryDelayMs: jitter stays within ±20 %", () => {
  assert.equal(retryDelayMs(1, 4, () => 0), 12_000);
  assert.equal(retryDelayMs(1, 4, () => 0.999999), Math.round(15_000 * (0.8 + 0.4 * 0.999999)));
});

test("retryDelayMs: the last attempt goes straight to the terminal path", () => {
  assert.equal(retryDelayMs(4, 4), 0);
  assert.equal(retryDelayMs(2, 2), 0);
  assert.equal(retryDelayMs(7, 4), 0);
});

test("breakerDelayMs: parked until the breaker reopens, plus up to 2 s of jitter", () => {
  assert.equal(breakerDelayMs(10_000, 4_000, () => 0), 6_000);
  assert.equal(breakerDelayMs(10_000, 4_000, () => 0.5), 7_000);
  assert.equal(breakerDelayMs(10_000, 12_000, () => 0), 0);
  assert.ok(breakerDelayMs(10_000, 4_000, () => 0.999) < 6_000 + BREAKER.reopenJitterMs);
});
