import test from "node:test";
import assert from "node:assert/strict";
import {
  assertNormalizedReading,
  SchemaError,
  upsertRecord,
  computeDelta,
  toKstDateKey,
} from "../lib/engine.js";

test("정상 payload는 그대로 통과한다", () => {
  const reading = assertNormalizedReading({
    signal_id: "demo",
    normalized_value: 100,
    unit: "pt",
    source_name: "test",
    source_url: "https://example.com",
    source_time: "2026-08-24T00:00:00.000Z",
    fetched_at: "2026-08-24T00:00:00.000Z",
    record_timezone: "Asia/Seoul",
    record_date: "2026-08-24",
  });
  assert.equal(reading.normalized_value, 100);
});

test("normalized_value가 문자열이면 SchemaError", () => {
  assert.throws(
    () =>
      assertNormalizedReading({
        signal_id: "demo",
        normalized_value: "105",
        unit: "pt",
        source_name: "test",
        source_url: "https://example.com",
        source_time: null,
        fetched_at: "2026-08-24T10:04:00.000Z",
        record_timezone: "Asia/Seoul",
        record_date: "2026-08-24",
      }),
    SchemaError
  );
});

test("같은 signal_id+record_date는 새 행을 만들지 않고 갱신한다 (D1-A → D1-B)", () => {
  let records = [];
  const a = { signal_id: "demo", record_date: "2026-08-24", normalized_value: 100, unit: "pt" };
  const b = { signal_id: "demo", record_date: "2026-08-24", normalized_value: 105, unit: "pt" };
  const r1 = upsertRecord(records, a);
  assert.equal(r1.newRowAdded, true);
  const r2 = upsertRecord(r1.records, b);
  assert.equal(r2.newRowAdded, false);
  assert.equal(r2.records.length, 1);
  assert.equal(r2.records[0].normalized_value, 105);
});

test("다음 날짜는 새 행이 되고 델타가 재계산된다", () => {
  let records = [];
  ({ records } = upsertRecord(records, { signal_id: "demo", record_date: "2026-08-24", normalized_value: 105, unit: "pt" }));
  ({ records } = upsertRecord(records, { signal_id: "demo", record_date: "2026-08-25", normalized_value: 120, unit: "pt" }));
  const { delta } = computeDelta(records, "demo");
  assert.equal(records.length, 2);
  assert.equal(delta, 15);
});

test("toKstDateKey는 UTC 자정 근처에서도 KST 날짜로 변환한다", () => {
  // 2026-08-23T15:00:00Z == 2026-08-24T00:00:00+09:00
  assert.equal(toKstDateKey("2026-08-23T15:00:00.000Z"), "2026-08-24");
});
