# T05 — 대화가 끊겨도 이어지는 프로젝트: 비교 보고서

프로젝트: `how-is-the-air` (초미세먼지 대시보드)
개선 기능: 최신 기록의 신선도(freshness) 판정 — `checkFreshness()`를 엔진에 추가하고 화면에 연결

---

## 1. 고정 검사 10개 (작업 시작 전 확정)

| ID | 입력 | 기대값 |
|---|---|---|
| F01 | fetched_at=now−1h, threshold=36 | fresh, hoursSinceUpdate≈1 |
| F02 | fetched_at=now−36h(정확히), threshold=36 | fresh (경계값) |
| F03 | fetched_at=now−36h1m, threshold=36 | stale |
| F04 | fetched_at=now(0h), threshold=36 | fresh, hoursSinceUpdate=0 |
| F05 | fetched_at=now−72h, threshold=36 | stale |
| F06 | latestRecord=null | no-data, hoursSinceUpdate=null |
| F07 | fetched_at=now+10m(미래), threshold=36 | fresh, hoursSinceUpdate=0(clamp) |
| F08 | fetched_at=now−25h, threshold=24 | stale |
| F09 | fetched_at=now−23h, threshold=24 | fresh |
| F10 | fetched_at=now−1s, threshold=36 | fresh, hoursSinceUpdate≈0.00028 |

구현: `tests/freshness.test.mjs`

## 2. 공통 사용 상한 (작업 전 고정, AI A·AI B 동일 적용)

- 시간 상한: 45분
- 요청/호출 수 상한: 15회

## 3. 전체 작업 기록 (A 시작 → A 인계 → B 시작 → B 완료)

| 단계 | 시각 | 소스 버전(커밋 SHA) | 비고 |
|---|---|---|---|
| AI A 시작 | 2026-09-15 | `433c536eebdd20756a5c34a5329c40d155f9e093` | `checkFreshness()` 미구현 상태 |
| AI A 종료·인계 | 2026-09-15 | `8ab460bdab5a4de0f4c17732d7096cb92fb9aa02` | 엔진 함수 + 검사 10개 구현, 화면 연결은 미완성 상태로 인수인계 |
| AI B 시작 | 2026-09-15 | `8ab460bdab5a4de0f4c17732d7096cb92fb9aa02` | 저장소 + `HANDOFF.md`만 제공 |
| AI B 종료 | 2026-09-15 | `52d78a5cb55c3a1fdf3028f4d128ebeb1908bfdc` | `app.js`·`style.css`에 연결 완료 |

인수인계 문서: [`HANDOFF.md`](./HANDOFF.md) (일곱 항목: 목표·현재상태·실행명령·통과검사·남은문제·다음행동·건드리지말것)
인수인계 누락: 없음 (AI B가 앞 대화나 추가 설명 없이 문서만으로 시작·완료함)

## 4. 이름을 가린 비교표

| 항목 | AI 1 | AI 2 |
|---|---|---|
| 실제 작업시간 | 약 15분 이내 | 45분 이상 (상한 초과) |
| 실제 요청/호출 수 | 약 12회 | 16회 이상 (상한 초과) |
| 오류 수 (검사 10개 중 1개 이상 FAIL한 실행 회차) | 0회 | 0회 |
| 검사 통과 수 | 10 / 10 | 10 / 10 |
| 시작 → 종료 고정 소스 버전 | `433c536` → `8ab460b` | `8ab460b` → `52d78a5` |

*AI 1은 엔진 로직(순수 함수) 구현까지, AI 2는 화면(UI) 연결까지를 각자 맡았습니다. 둘 다 결과 코드는 통과 검사 10개를 전부 만족했지만, AI 2는 무료 사용 한도에 걸려 중간에 세션이 끊기면서 상한을 초과했습니다.*

## 5. 다음 작업에서 도구를 고르는 기준

**결과 품질은 둘 다 같았지만, 무료 사용 한도가 낮은 도구는 작업 도중 세션이 끊겨 상한 관리가 어려우므로, 다음에는 한 번에 끊기지 않고 작업을 마칠 수 있는 여유 한도의 도구를 우선 선택한다.**

## 6. 재현·통과 확인 4가지

- **어디로 가나요**: https://kwonbhin.github.io/how-is-the-air/
- **3단계 이내 무엇을 하나요**: ① 페이지 접속 → ② 몇 초간 데이터 로딩 대기 → ③ "지금 초미세먼지" 카드 확인
- **무엇이 보이면 통과인가요**: PM2.5 수치(예: `13.3 μg/m³`)가 표시되고, 최근 36시간 이내 수집이면 배지 없이 값만, 36시간을 넘으면 "오래된 값 · N시간 전 마지막 수집" 배지가 값 옆에 표시됨
- **안 될 때 무엇이 보이나요**: "아직 값 없음" 또는 "불러오는 중…"에서 멈춰 있음

## 7. AI와 나의 판단

- **AI에게 맡긴 일**: `checkFreshness()` 함수 구현과 검사 10개 작성(AI 1), `app.js`·`style.css`에 실제 연결(AI 2)
- **내가 직접 판단한 일**: 개선할 기능 후보 3개 중 최종 선택, 검사 10개·공통 상한 확정, AI 2의 최종 결과를 실제 배포 사이트 스크린샷으로 직접 검증
- **AI 제안을 따르지 않은 일**: AI 2(ChatGPT)가 "배포된 사이트의 `records.json` 데이터가 비어 있다"고 진단했으나, 직접 저장소와 실제 사이트를 확인한 결과 데이터가 정상 존재했음을 확인하고 그 진단에 따른 추가 디버깅을 진행하지 않음

---

*대화 전문은 포함하지 않았습니다. 고정 검사, 집계 결과, 인수인계 문서, 본인 판단만 남겼습니다.*
