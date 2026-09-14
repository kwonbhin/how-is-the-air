# 지금, 우리 동네 공기 — 대구 초미세먼지(PM2.5)
 
과제 T04(오늘의 진짜 정보판 — 데이터가 안 올 때) 제출용 정적 웹 앱입니다.
 
## 무엇을 보여주나요
 
- **실제 값**: [Open-Meteo 대기질 API](https://open-meteo.com/en/docs/air-quality-api)로 대구(35.8714, 128.6014)의 초미세먼지(PM2.5, µg/m³) 농도를 조회합니다. API 키가 필요 없는 공개 원천입니다(CORS 공식 지원, 날씨 API와 같은 인프라).
- **매일 자동 수집**: GitHub Actions 스케줄이 매일 `scripts/collect.mjs`를 실행해 `data/records.json`에 Asia/Seoul 날짜를 키로 원자적으로 upsert 합니다. 같은 날 재실행은 한 행을 갱신하고, 다음 날짜는 새 행을 만듭니다.
- **실패해도 정직하게**: 5가지 실패(느린 응답·401/403·429·오프라인·형식변경)를 공식 배포 fixture로 합성 재생하며, 실패해도 마지막 정상값을 지우지 않고 `stale` + 에러코드만 별도로 보여줍니다.
- **비밀키 없음**: 브라우저 코드·배포 파일·Git 기록 어디에도 비밀키가 없습니다(원천 자체가 키 불필요).
## 값이 뜻하는 것
 
- `current.pm2_5` = 지름 2.5㎛ 이하 초미세먼지의 대기 중 농도(µg/m³). WHO가 대기질 가이드라인에서 쓰는 것과 같은 지표예요.
- 값이 클수록 공기가 나쁘다는 뜻이에요(대략 0~15: 좋음, 15~35: 보통, 35+: 나쁨 — 정확한 등급은 나라별 기준에 따라 다름).
- 출처 시각은 응답의 `current.time`(Asia/Seoul 로컬 시각) 필드를 그대로 씁니다.
## 화면 구성 (한 화면 대시보드 + 시간대별 하늘 테마)
 
스크롤 없이 한 화면에 들어오도록 좌/우 2단으로 배치했습니다. 기술 용어(freshness·error_code 등, 채점 기준이 요구하는 표기)는 그대로 남기되, 쉬운 말 설명을 덧붙였습니다.
 
- 배경: 접속 시각(Asia/Seoul 기준) 새벽(5-7시)·낮(7-17시)·노을(17-19시)·밤(19-5시)에 따라 하늘색과 해/달 위치가 자동으로 바뀝니다.
- 뿌연 정도: 화면 전체에 깔리는 반투명 레이어의 진하기가 실제 PM2.5 값에 비례합니다 (값이 높을수록 화면이 실제로 뿌옇게 보임).
- 오른쪽 위 배지: 🟢좋음·🟡보통·🟠나쁨·🔴매우나쁨 등급 + 현재 수치
- 왼쪽 패널 "지금까지의 기록": 실제 값·단위·출처·출처시각·조회시각·기준시간대 + 날짜별 기록 표 (카드1·4·5)
- 오른쪽 패널 "신호가 끊기면?": 5가지 실패를 "측정소 서버가 문을 안 열어줌(401)"처럼 비유로 설명 + 원래 error_code 병기 (카드3)
## 로컬에서 보기
 
```bash
npx serve .
# 또는
python3 -m http.server 8080
```
 
## 테스트
 
```bash
npm test
```
 
`lib/engine.js`의 정규화·upsert·델타 재계산 로직을 검사합니다. (브라우저용 `app.js`와 수집용 `scripts/collect.mjs`가 같은 `lib/engine.js`를 공유합니다.)
 
## 실제 값 수집을 수동으로 돌려보기
 
```bash
node scripts/collect.mjs
```
 
`data/records.json`이 갱신됩니다. 실패해도 기존 파일은 바뀌지 않고 `data/collect-log.json`에 실패 로그만 남습니다.
 
## GitHub에 배포하기
 
1. 이 폴더 전체를 새 GitHub 저장소(퍼블릭)에 푸시합니다.
2. 저장소 **Settings → Pages → Build and deployment → Source**를 **GitHub Actions**로 설정합니다.
3. **Actions** 탭에서 `Collect and deploy real-time board` 워크플로를 한 번 수동 실행(`workflow_dispatch`)합니다. → 첫 실제 기록 1건 + Pages 배포가 이루어집니다.
4. **서로 다른 실제 KST 날짜에** 워크플로가 한 번 더 성공하면(스케줄 자동 실행 또는 수동 재실행) 두 번째 기록이 생기고, 화면에 "전일 대비"가 자동으로 다시 계산되어 뜹니다. 이 두 번째 날짜는 기다려야 하며, 기록을 미리 조작하지 않습니다.
5. 결과물 주소: `https://<사용자명>.github.io/<저장소명>/`
6. 소스 주소(T04-C35 — commit 해시 포함): `https://github.com/<사용자명>/<저장소명>/tree/<40자리 커밋 SHA>`
   - 커밋 해시는 `git log -1 --format=%H` 로 확인합니다.
## 폴더 구조
 
```
index.html, style.css, app.js   대시보드(공개 심사 화면)
lib/engine.js                   정규화·upsert·델타 공통 로직 (브라우저+Node 공유)
scripts/collect.mjs             매일 실제 값을 수집해 data/records.json에 원자적으로 기록
data/records.json               공개 보존 기록 (커밋되는 실제 데이터)
fixtures/*.json                 공식 배포 합성 fixture 9종 (원본 그대로, SHA-256 대조 완료)
tests/engine.test.mjs           엔진 로직 단위 테스트
.github/workflows/              매일 수집 + Pages 배포 워크플로
```
 
## 원천 인용
 
- Open-Meteo Air Quality API — https://open-meteo.com/ (CC BY 4.0, 비상업적 이용 무료, API 키 불필요, CORS 지원)
 
