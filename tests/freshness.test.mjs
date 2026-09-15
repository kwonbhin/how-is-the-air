// tests/freshness.test.mjs
// T05 카드1에서 고정한 검사 10개(F01~F10)를 그대로 구현한 테스트입니다.
// checkFreshness()는 순수 함수이므로 네트워크·타이머 없이 검증합니다.

import test from "node:test";
import assert from "node:assert/strict";
import { checkFreshness } from "../lib/engine.js";

const NOW = "2026-09-15T12:00:00.000Z";
const nowMs = new Date(NOW).getTime();

function hoursAgoIso(hours) {
  return new Date(nowMs - hours * 60 * 60 * 1000).toISOString();
}
function fromNowIso(msOffset) {
  return new Date(nowMs + msOffset).toISOString();
}

test("F01: 1시간 전 기록, threshold=36 -> fresh, hoursSinceUpdate≈1", () => {
  const r = checkFreshness({ fetched_at: hoursAgoIso(1) }, NOW, 36);
  assert.equal(r.status, "fresh");
  assert.ok(Math.abs(r.hoursSinceUpdate - 1) < 0.001);
});

test("F02: 정확히 36시간 전, threshold=36 -> fresh (경계값)", () => {
  const r = checkFreshness({ fetched_at: hoursAgoIso(36) }, NOW, 36);
  assert.equal(r.status, "fresh");
});

test("F03: 36시간 1분 전, threshold=36 -> stale", () => {
  const r = checkFreshness({ fetched_at: hoursAgoIso(36 + 1 / 60) }, NOW, 36);
  assert.equal(r.status, "stale");
});

test("F04: 지금(0시간 전), threshold=36 -> fresh, hoursSinceUpdate=0", () => {
  const r = checkFreshness({ fetched_at: NOW }, NOW, 36);
  assert.equal(r.status, "fresh");
  assert.equal(r.hoursSinceUpdate, 0);
});

test("F05: 72시간 전, threshold=36 -> stale", () => {
  const r = checkFreshness({ fetched_at: hoursAgoIso(72) }, NOW, 36);
  assert.equal(r.status, "stale");
});

test("F06: 기록 없음(null) -> no-data, hoursSinceUpdate=null", () => {
  const r = checkFreshness(null, NOW, 36);
  assert.equal(r.status, "no-data");
  assert.equal(r.hoursSinceUpdate, null);
});

test("F07: 미래 시각(시계오차, +10분), threshold=36 -> fresh, hoursSinceUpdate=0(clamp)", () => {
  const r = checkFreshness({ fetched_at: fromNowIso(10 * 60 * 1000) }, NOW, 36);
  assert.equal(r.status, "fresh");
  assert.equal(r.hoursSinceUpdate, 0);
});

test("F08: 25시간 전, threshold=24 -> stale", () => {
  const r = checkFreshness({ fetched_at: hoursAgoIso(25) }, NOW, 24);
  assert.equal(r.status, "stale");
});

test("F09: 23시간 전, threshold=24 -> fresh", () => {
  const r = checkFreshness({ fetched_at: hoursAgoIso(23) }, NOW, 24);
  assert.equal(r.status, "fresh");
});

test("F10: 1초 전, threshold=36 -> fresh, hoursSinceUpdate≈0.00028", () => {
  const r = checkFreshness({ fetched_at: hoursAgoIso(1 / 3600) }, NOW, 36);
  assert.equal(r.status, "fresh");
  assert.ok(Math.abs(r.hoursSinceUpdate - 1 / 3600) < 1e-6);
});
