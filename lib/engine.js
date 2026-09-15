// lib/engine.js
// 실시간(live) 조회와 합성(replay) 조회가 반드시 이 파일의 함수만 통해서
// 저장 상태를 바꾸도록 만든 공통 엔진입니다.
// 브라우저(app.js)와 Node(scripts/collect.mjs) 양쪽에서 그대로 import 합니다.
 
export class SchemaError extends Error {
  constructor(message) {
    super(message);
    this.name = "SchemaError";
  }
}
 
const REQUIRED_FIELDS = [
  "signal_id",
  "normalized_value",
  "unit",
  "source_name",
  "source_url",
  "source_time",
  "fetched_at",
  "record_timezone",
  "record_date",
];
 
/**
 * normalized-reading.schema.json 을 최소한으로 검사합니다.
 * 통과하면 그대로 반환하고, 실패하면 SchemaError를 던집니다.
 * (T04-SCHEMA-BREAK fixture 처럼 normalized_value가 문자열로 오는 경우를 걸러냅니다.)
 */
export function assertNormalizedReading(raw) {
  if (!raw || typeof raw !== "object") {
    throw new SchemaError("payload가 객체가 아닙니다.");
  }
  for (const key of REQUIRED_FIELDS) {
    if (!(key in raw)) {
      throw new SchemaError(`필수 필드 누락: ${key}`);
    }
  }
  if (typeof raw.normalized_value !== "number" || Number.isNaN(raw.normalized_value)) {
    throw new SchemaError("normalized_value는 number여야 합니다.");
  }
  if (typeof raw.unit !== "string" || raw.unit.length === 0) {
    throw new SchemaError("unit은 비어 있지 않은 문자열이어야 합니다.");
  }
  if (typeof raw.source_name !== "string" || raw.source_name.length === 0) {
    throw new SchemaError("source_name은 비어 있지 않은 문자열이어야 합니다.");
  }
  if (typeof raw.source_url !== "string" || !raw.source_url.startsWith("https://")) {
    throw new SchemaError("source_url은 https:// 로 시작해야 합니다.");
  }
  if (raw.source_time !== null && typeof raw.source_time !== "string") {
    throw new SchemaError("source_time은 문자열이거나 null이어야 합니다.");
  }
  if (typeof raw.fetched_at !== "string") {
    throw new SchemaError("fetched_at은 문자열이어야 합니다.");
  }
  if (raw.record_timezone !== "Asia/Seoul") {
    throw new SchemaError("record_timezone은 Asia/Seoul 이어야 합니다.");
  }
  if (typeof raw.record_date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(raw.record_date)) {
    throw new SchemaError("record_date 형식이 YYYY-MM-DD가 아닙니다.");
  }
  return {
    signal_id: raw.signal_id,
    normalized_value: raw.normalized_value,
    unit: raw.unit,
    source_name: raw.source_name,
    source_url: raw.source_url,
    source_time: raw.source_time,
    fetched_at: raw.fetched_at,
    record_timezone: raw.record_timezone,
    record_date: raw.record_date,
  };
}
 
/**
 * fetched_at(ISO) 을 Asia/Seoul 기준 YYYY-MM-DD 로 바꿉니다.
 */
export function toKstDateKey(isoString) {
  const d = new Date(isoString);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);
  const y = parts.find((p) => p.type === "year").value;
  const m = parts.find((p) => p.type === "month").value;
  const day = parts.find((p) => p.type === "day").value;
  return `${y}-${m}-${day}`;
}
 
export function formatKst(isoString) {
  if (!isoString) return null;
  const d = new Date(isoString);
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(d) + " KST";
}
 
/**
 * signal_id + record_date 를 고유키로 삼아 원자적으로 upsert 합니다.
 * 같은 날짜가 이미 있으면 그 행을 갱신(새 행 생성 안 함),
 * 없으면 새 행을 추가합니다.
 * 반환값: { records: 새 배열, newRowAdded: boolean, row: 저장된 행 }
 */
export function upsertRecord(records, reading) {
  const idx = records.findIndex(
    (r) => r.signal_id === reading.signal_id && r.record_date === reading.record_date
  );
  const row = { ...reading, updated_at: new Date().toISOString() };
  if (idx === -1) {
    return { records: [...records, row], newRowAdded: true, row };
  }
  const next = records.slice();
  next[idx] = row;
  return { records: next, newRowAdded: false, row };
}
 
/**
 * 같은 signal_id의 기록을 record_date 오름차순으로 정렬한 뒤,
 * 최신 값 - 그 직전 값을 다시 계산합니다. 기록이 2건 미만이면 null.
 */
export function computeDelta(records, signalId) {
  const rows = records
    .filter((r) => r.signal_id === signalId)
    .slice()
    .sort((a, b) => (a.record_date < b.record_date ? -1 : a.record_date > b.record_date ? 1 : 0));
  if (rows.length < 2) return { delta: null, prev: null, latest: rows.at(-1) ?? null, rows };
  const latest = rows.at(-1);
  const prev = rows.at(-2);
  return { delta: latest.normalized_value - prev.normalized_value, prev, latest, rows };
}
 
/**
 * 가장 최근 기록(latestRecord)이 지금(nowIso) 기준으로 얼마나 지났는지 보고,
 * fresh(신선함) / stale(오래됨) / no-data(기록 없음) 상태를 판정합니다.
 *
 * - latestRecord가 없으면(null/undefined) "no-data".
 * - latestRecord.fetched_at 이 nowIso 보다 미래(시계 오차 등)면 0시간으로 clamp하여 "fresh".
 * - hoursSinceUpdate <= thresholdHours 이면 "fresh", 초과하면 "stale".
 *
 * 순수 함수이며 DOM/네트워크에 의존하지 않습니다. (T05 카드1 — F01~F10 검사 대상)
 *
 * @param {{fetched_at: string} | null | undefined} latestRecord
 * @param {string} nowIso - 기준 시각(ISO 문자열)
 * @param {number} thresholdHours - 이 시간(시간 단위)을 넘으면 stale
 * @returns {{status: "fresh"|"stale"|"no-data", hoursSinceUpdate: number|null}}
 */
export function checkFreshness(latestRecord, nowIso, thresholdHours) {
  if (!latestRecord || typeof latestRecord.fetched_at !== "string") {
    return { status: "no-data", hoursSinceUpdate: null };
  }
  const fetchedMs = new Date(latestRecord.fetched_at).getTime();
  const nowMs = new Date(nowIso).getTime();
  const rawHours = (nowMs - fetchedMs) / (1000 * 60 * 60);
  const hoursSinceUpdate = Math.max(0, rawHours); // 미래 시각(시계 오차)은 0으로 clamp
  const status = hoursSinceUpdate <= thresholdHours ? "fresh" : "stale";
  return { status, hoursSinceUpdate };
}
 
/**
 * 실패 에러코드를 사람이 읽을 설명으로 바꿉니다. (화면 상태 문구용)
 */
export const ERROR_DESCRIPTIONS = {
  none: "정상",
  timeout: "응답이 제한 시간(1.5초)보다 늦게 도착했습니다.",
  auth: "외부 원천이 인증을 거절했습니다 (401/403).",
  rate_limit: "외부 원천이 호출 제한을 걸었습니다 (429). 잠시 후 다시 시도하세요.",
  offline: "네트워크 연결이 끊겼습니다.",
  schema_error: "외부 응답의 형식(스키마)이 바뀌었습니다.",
};
 
