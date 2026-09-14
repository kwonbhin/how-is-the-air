// scripts/collect.mjs
// 실행: node scripts/collect.mjs
// GitHub Actions 스케줄(cron) 또는 수동 실행으로 하루 한 번(또는 여러 번) 돌립니다.
// - 실제 공개 원천(Open-Meteo 대기질 API, 대구 초미세먼지 PM2.5)을 비밀키 없이 조회합니다.
// - Asia/Seoul 기준 날짜를 키로 삼아 data/records.json 에 원자적으로 upsert 합니다.
// - 실패해도 마지막 정상 기록을 지우지 않고, 실패 사유를 별도 로그로 남깁니다.

import { readFile, writeFile, rename, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { assertNormalizedReading, upsertRecord, toKstDateKey } from "../lib/engine.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "..", "data");
const RECORDS_PATH = path.join(DATA_DIR, "records.json");
const LOG_PATH = path.join(DATA_DIR, "collect-log.json");

const SIGNAL_ID = "daegu-pm25";
const SOURCE_NAME = "Open-Meteo 대기질 API (대구 초미세먼지 PM2.5)";
// 비밀키가 필요 없는 공개 API입니다.
const SOURCE_URL =
  "https://air-quality-api.open-meteo.com/v1/air-quality?latitude=35.8714&longitude=128.6014&current=pm2_5&timezone=Asia%2FSeoul";

async function atomicWriteJson(filePath, data) {
  const dir = path.dirname(filePath);
  if (!existsSync(dir)) await mkdir(dir, { recursive: true });
  const tmpPath = path.join(dir, `.${path.basename(filePath)}.tmp-${process.pid}`);
  await writeFile(tmpPath, JSON.stringify(data, null, 2) + "\n", "utf8");
  await rename(tmpPath, filePath); // 같은 폴더 내 rename = 원자적 치환
}

async function loadRecords() {
  if (!existsSync(RECORDS_PATH)) return { records: [] };
  const raw = await readFile(RECORDS_PATH, "utf8");
  return JSON.parse(raw);
}

async function appendLog(entry) {
  let log = { entries: [] };
  if (existsSync(LOG_PATH)) {
    log = JSON.parse(await readFile(LOG_PATH, "utf8"));
  }
  log.entries.push(entry);
  // 로그가 너무 커지지 않도록 최근 200건만 유지합니다.
  log.entries = log.entries.slice(-200);
  await atomicWriteJson(LOG_PATH, log);
}

async function fetchLive() {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(SOURCE_URL, { signal: controller.signal });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    const json = await res.json();
    if (
      !json.current ||
      typeof json.current.pm2_5 !== "number" ||
      typeof json.current.time !== "string"
    ) {
      throw new Error("응답 형식이 예상과 다릅니다 (schema_error).");
    }
    const fetchedAt = new Date().toISOString();
    // Open-Meteo의 current.time은 timezone=Asia/Seoul 파라미터 덕분에
    // 이미 한국시간 로컬 표기(오프셋 없음)이므로 KST로 명시해 ISO로 만듭니다.
    const sourceTimeIso = `${json.current.time}:00+09:00`;
    const raw = {
      signal_id: SIGNAL_ID,
      normalized_value: json.current.pm2_5,
      unit: json.current_units?.pm2_5 ?? "µg/m³",
      source_name: SOURCE_NAME,
      source_url: SOURCE_URL,
      source_time: sourceTimeIso,
      fetched_at: fetchedAt,
      record_timezone: "Asia/Seoul",
      record_date: toKstDateKey(fetchedAt),
    };
    return assertNormalizedReading(raw);
  } finally {
    clearTimeout(timer);
  }
}

async function main() {
  const store = await loadRecords();
  const before = store.records.length;
  try {
    const reading = await fetchLive();
    const { records, newRowAdded, row } = upsertRecord(store.records, reading);
    store.records = records;
    await atomicWriteJson(RECORDS_PATH, store);
    await appendLog({
      at: new Date().toISOString(),
      status: "ok",
      newRowAdded,
      row_count_before: before,
      row_count_after: records.length,
      stored_value: row.normalized_value,
      record_date: row.record_date,
    });
    console.log(
      `[collect] 성공: ${row.record_date} = ${row.normalized_value}${row.unit} ` +
        `(새 행: ${newRowAdded ? "예" : "아니오(같은 날 갱신)"})`
    );
  } catch (err) {
    // 실패해도 기존 records.json은 절대 건드리지 않습니다 (마지막 정상값 보존).
    await appendLog({
      at: new Date().toISOString(),
      status: "error",
      message: String(err && err.message ? err.message : err),
      row_count: before,
    });
    console.error(`[collect] 실패(마지막 정상 기록은 유지됨): ${err.message}`);
    process.exitCode = 1;
  }
}

main();
