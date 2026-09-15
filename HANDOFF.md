# 인수인계 문서 — T05 카드3

이 문서 + 아래 저장소 버전만 보고, 이전 대화 기록 없이 작업을 이어받으세요.

- **저장소**: https://github.com/kwonbhin/how-is-the-air
- **버전 ID (커밋 SHA)**: `8ab460bdab5a4de0f4c17732d7096cb92fb9aa02`
- **체크아웃 명령**: `git clone https://github.com/kwonbhin/how-is-the-air.git && cd how-is-the-air && git checkout 8ab460bdab5a4de0f4c17732d7096cb92fb9aa02`

---

## 1. 목표

`lib/engine.js`에 이미 있는 순수 함수 `checkFreshness(latestRecord, nowIso, thresholdHours)`를
**실제 대시보드 화면(app.js)에 연결**하여, 최신 기록이 몇 시간 지났는지에 따라
"신선함(fresh)" 또는 "오래됨(stale)" 배지를 정확한 문구로 보여준다.
지금은 엔진 로직만 있고 화면(UI)에는 연결되어 있지 않다.

## 2. 현재 상태

- `lib/engine.js`에 `checkFreshness()` 함수가 구현되어 있고 테스트도 통과함 (아래 3번 참고).
- 그러나 `app.js`의 `loadPublicRecords()` 함수는 **아직 옛날 로직**을 그대로 쓰고 있음:
  ```js
  const today = todayKstDateStr();
  const isStale = latest.record_date !== today;
  const staleBadge = isStale
    ? `<span class="stale-tag">오래된 값 · 최근 수집 실패 가능 (마지막 성공: ${escapeHtml(latest.record_date)})</span>`
    : "";
  ```
  이건 "오늘 날짜인가 아닌가"만 보는 거친 로직이라, `checkFreshness()`(시간 단위 정밀 판정)로 교체해야 함.
- `style.css`의 `.stale-tag` 스타일은 있지만, 새 상태(fresh/stale에 따라 색을 다르게 하는 등)는 반영 안 됨.
- 임계값(threshold)은 **36시간**으로 카드1에서 고정함.

## 3. 실행 명령

```bash
git clone https://github.com/kwonbhin/how-is-the-air.git
cd how-is-the-air
node --test tests/*.mjs
```

주의: `package.json`의 `npm test`(`node --test tests/`) 스크립트는 일부 환경에서
디렉터리 인자를 못 읽는 이슈가 있었음(이 프로젝트만의 문제는 아니고 환경 이슈로 추정).
안 되면 `node --test tests/*.mjs`로 실행할 것.

로컬 화면 확인:
```bash
npx serve .
# 또는
python3 -m http.server 8080
```

## 4. 통과 검사 (카드1에서 고정한 10개, 지금 전부 통과 상태)

| ID | 입력 | 기대값 | 현재 상태 |
|---|---|---|---|
| F01 | fetched_at=now−1h, threshold=36 | fresh, hoursSinceUpdate≈1 | PASS |
| F02 | fetched_at=now−36h(정확히), threshold=36 | fresh (경계값) | PASS |
| F03 | fetched_at=now−36h1m, threshold=36 | stale | PASS |
| F04 | fetched_at=now(0h), threshold=36 | fresh, hoursSinceUpdate=0 | PASS |
| F05 | fetched_at=now−72h, threshold=36 | stale | PASS |
| F06 | latestRecord=null | no-data, hoursSinceUpdate=null | PASS |
| F07 | fetched_at=now+10m(미래), threshold=36 | fresh, hoursSinceUpdate=0(clamp) | PASS |
| F08 | fetched_at=now−25h, threshold=24 | stale | PASS |
| F09 | fetched_at=now−23h, threshold=24 | fresh | PASS |
| F10 | fetched_at=now−1s, threshold=36 | fresh, hoursSinceUpdate≈0.00028 | PASS |

전부 `tests/freshness.test.mjs`에 구현되어 있고, `node --test tests/*.mjs` 실행 시 15/15(기존 5개+F01~F10) 통과함.
**이 10개 검사의 ID·입력·기대값은 절대 삭제·완화·변경하지 말 것** (T05-C18~C20).

## 5. 남은 문제

1. `app.js`의 `loadPublicRecords()`가 `checkFreshness()`를 호출하지 않음 — 옛날 날짜 비교 로직 그대로임.
2. 화면에 "몇 시간 전" 같은 정보가 안 보임 (지금은 "마지막 성공: 2026-09-14" 같은 날짜만 보임).
3. `no-data` 상태(기록이 아예 없을 때)에 대한 화면 처리가 명확히 안 되어 있음 — 현재는 별도 분기(`records.length === 0`)로 처리 중이라 `checkFreshness`의 `no-data`와 통합할지 결정 필요.
4. `.stale-tag` 배지 스타일이 fresh/stale 구분 없이 하나뿐임.

## 6. 다음 행동

1. `app.js`의 `loadPublicRecords()` 안에서 최신 기록(`latest`)을 얻은 직후, `checkFreshness(latest, new Date().toISOString(), 36)` 호출.
2. 반환된 `status`에 따라 배지 문구 교체:
   - `fresh`: 배지 없음 또는 "방금 확인함" 같은 가벼운 표시
   - `stale`: "오래된 값 · N시간 전 마지막 수집" (hoursSinceUpdate를 정수로 반올림해서 문구에 넣기)
   - `no-data`: 기존 "아직 값 없음" 분기 유지
3. `style.css`에 `.stale-tag`(또는 새 클래스)에 fresh/stale 색 구분 추가(선택 사항, 필수 아님).
4. 완료 후 `node --test tests/*.mjs`로 F01~F10 + 기존 5개가 여전히 15/15 통과하는지 재확인.
5. 새 커밋을 만들고, 그 커밋 SHA를 "AI B 종료 시점 소스 버전"으로 보고서에 기록.

## 7. 건드리지 말 것

- `tests/engine.test.mjs`, `tests/freshness.test.mjs`의 기존 테스트 케이스(ID·입력·기대값) — 삭제·완화·변경 금지.
- `lib/engine.js`의 기존 함수(`assertNormalizedReading`, `upsertRecord`, `computeDelta`, `toKstDateKey`, `formatKst`) — 시그니처 변경 금지.
- `scripts/collect.mjs`, `.github/workflows/` — 자동 수집 파이프라인은 이 작업과 무관하니 건드리지 말 것.
- `data/records.json`, `data/collect-log.json` — 실제 수집 기록이니 수동으로 편집하지 말 것.
