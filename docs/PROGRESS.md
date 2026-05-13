# 진행 로그 (Progress Log)

이 문서는 단계별 완성 상태, 그 과정에서 합의된 설계 결정, 검증되지 않은
영역, 다음에 해야 할 일을 기록한다. **미래 세션이 이 문서만 보고도 "어디까지
왔고 무엇을 검증해야 하는지" 파악할 수 있도록** 만들어진 핸드오프 노트.

- 원본 명세: [PROJECT_SPEC.md](./PROJECT_SPEC.md)
- 환경 세팅: [SETUP.md](./SETUP.md)
- 작업 브랜치: `claude/analyze-project-spec-VcuOY`

---

## Step 1 — UI 스캐폴드 + Mock 통합 차트

**산출물**
- Next.js 16 (App Router) + Tailwind v4 + lightweight-charts v5 셋업
- `app/page.tsx`: 종목 셀렉터, 기간 토글, 지표 토글
- `components/IntegratedChart.tsx`: lightweight-charts v5 multi-pane (가격/거래량/검색/뉴스+감성 4-pane, 같은 시간축)
- `components/IndicatorToggle.tsx`, `TickerSearch.tsx`, `NewsPanel.tsx`,
  `SentimentChart.tsx`, `EventMarkers.tsx`, `CorrelationPanel.tsx`,
  `InterpretationPanel.tsx` — Step 1에서는 mock 데이터로 동작하는 골격
- `lib/mockData.ts`: 결정론적 합성 시리즈 (`buildMockSeries`)
- `lib/indicators.ts`: `sma`, `pctChange`, `spikes` (z-score), `dailyReturn`
- `data/keywords/tickers.json`: 5종목 메타 + 다국어 트렌드 키워드
- `types/index.ts`: `IntegratedSeries` / `IntegratedPoint` / `TickerMeta` / `Region`

**의도**: 데이터 소스가 mock이든 실데이터든 컴포넌트 시그니처를 안 바꾸도록
공용 `IntegratedSeries` 타입으로 모든 시각화 통일.

---

## Step 2 — yfinance Python 수집기 + JSON 캐시 + Next.js API

**산출물**
- `scripts/python/fetch_stock.py`: `yf.Ticker(t).history(period="6mo")` 일봉 OHLCV
- `scripts/python/common.py`: 경로, 티커 로더, JSON atomic write (tmp→rename)
- `scripts/python/scheduler.py`: 모든 수집기 일괄 실행 (cron 대체)
- `scripts/python/requirements.txt`: yfinance, pandas, pytrends, feedparser
- `lib/cache.ts`: server-only 캐시 reader (`readStockCache`)
- `app/api/series/[ticker]/route.ts`: 캐시 있으면 yfinance, 없으면 mock 폴백
- `components/SourceBadge.tsx`: 채널별 출처(`mock` 노랑, 실데이터 녹색) 표시
- `app/page.tsx`: API fetch로 전환 + 로딩/에러/새로고침/SourceBadge

**의도**: Python ↔ Next.js 인터페이스는 **JSON 파일만**. 둘 사이에 네트워크
프로토콜 없음.

---

## Step 3 — pytrends 그룹 조회 + 정렬/forward-fill

**산출물**
- `scripts/python/fetch_trends.py`: `pytrends.interest_over_time()`,
  `today 3-m` 일별, region별 geo (US/KR)
  - 그룹 키워드(최대 5개)를 한 번에 조회해 키워드별 시계열을 **평균**낸 그룹
    대표 1개 시계열로 저장
  - `raw trend` + `sma7` + `wow(전주 대비 변화율)` + 기준기간(`timeframe`,
    `geo`) 함께 저장
- API 라우트: 가격 dates에 trend를 정렬(`alignTrends`)
  - 정확 일치 우선 → 직전 last-known forward-fill → 그래도 없으면 mock signal
- 종목 간 8초 sleep로 pytrends 429 회피

**의도**: pytrends는 비공식·재정규화 위험이 큼 → 컨텍스트(기준기간) 보존이
스펙 요구. API 호출 시 실시간 fetch 절대 안 함.

---

## Step 4 — 뉴스 RSS + 키워드 감성

**산출물**
- `scripts/python/sentiment.py`: KO/EN 키워드 사전 + `score(text) → (pos, neg)`
  - 영어: 단어 토큰 매칭 (`\b` 기준 소문자화 후 set lookup)
  - 한국어: 부분 문자열 매칭 (형태소 분석기 회피)
- `scripts/python/fetch_news.py`: feedparser로 Google News RSS
  - region별 `hl/gl/ceid` 분기 (`hl=ko gl=KR ceid=KR:ko` vs `en-US/US/US:en`)
  - `trendsKeywords` 그룹을 `OR`로 묶어 다국어 헤드라인 함께 수집
  - 일자별 `count/pos/neg` 집계 + 기사 목록 저장
- `components/NewsPanel.tsx`: 실데이터 있으면 클릭 가능 헤드라인 + 출처 표시
- API 라우트: news 캐시 `byDay`를 가격 dates에 정렬, `recentNews` 응답에 포함

**의도**: NewsAPI 같은 키 발급 단계 없이 즉시 가능한 RSS 한 곳으로. 정밀도는
거칠지만 "관찰" 목적에 충분.

---

## Step 5 — 리드/래그 −7 ~ +7일 상관 분석

**산출물**
- `lib/correlation.ts`: 순수 함수 모듈
  - `pearson(xs, ys)` — n<2 또는 분산 0이면 null
  - `dailyReturns(closes)` — 첫 원소 null, 나머지 pct
  - `leadLag(x, y, lags)` — `x[i]` vs `y[i+L]` 페어, n<14면 null
  - `buildCorrelations(points)` — 3 pair 자동 산출:
    1. 검색 관심도 → 가격 수익률
    2. 검색 관심도 → 거래량
    3. 뉴스량 → 거래량
- `components/CorrelationPanel.tsx`: heatmap(3×15) + pair별 막대 차트
  + 요약 테이블 (peak lag, r, n, 한국어 해석)
- `app/page.tsx`: 패널을 전용 폭 넓은 섹션으로 승격

**의도**: lag 규약은 `L>0 → X가 Y를 L일 선행`. 색은 부호 구분에만
(emerald/rose) 최소 사용. 한쪽 시그널 0/없음 / 표본 부족(n<14) 시 명시.

**수학 검증 완료**: 인공 sin파(x leads y by 3)로 `peak lag=+3, r=1.000`.

---

## Step 6 — 차트 이벤트 마커 + 패널 클릭 디테일

**산출물**
- `lib/events.ts`: 단일 진입점 `detectEvents()` — 차트·패널 공유
  - z-score>2σ 스파이크 (검색·뉴스·거래량)
  - 가격 ±5% 급변 (price-up / price-down)
- `components/IntegratedChart.tsx`: lightweight-charts v5
  `createSeriesMarkers`로 캔들 위 마커
  - 검색 급증 = 보라 원 / 뉴스 급증 = 회색 사각 / 가격 급등 = 녹 ↑ +
    `+X%` / 급락 = 적 ↓ / 거래량 급증 = 파랑 사각
  - `focusDate` prop으로 `setVisibleRange` 줌
- `components/EventMarkers.tsx`: 클릭 가능 리스트
  - 항목 클릭 → 인라인 디테일 카드 (OHLCV/검색/뉴스/긍부정) + 같은 날짜
    뉴스 헤드라인 최대 4건 클릭 링크
  - `onSelect(date)` → 차트 focusDate 동기화

---

## 합의된 핵심 설계 결정

### 1) 백엔드 아키텍처
- **Python 수집기 → JSON 파일 캐시 → Next.js Route Handler가 read**.
- 별도 Node/FastAPI 백엔드 없음. 단방향 파이프라인.
- 이유: 종목 수가 적고 수집 빈도가 낮아 DB나 API 서버가 과잉. 운영
  단순성이 정확도/실시간성보다 중요한 단계.

### 2) MVP 1차 범위
- 명세서 6단계 모두 (스캐폴드 → yfinance → pytrends → news+감성 → 상관
  → 이벤트마커).
- **코드 레벨 완료. 실 데이터 검증 미완.**
- Step 7+ (알람, 다중 종목 비교, 백엔드 마이그 등)는 검증 후 논의.

### 3) 종목 범위
- 5개 기본: `TSLA`, `NVDA`, `AAPL`, `005930.KS` (삼성전자), `086520.KQ`
  (에코프로).
- `data/keywords/tickers.json` 으로 자유 추가/수정.
- 한국 종목 접미사: **코스피 `.KS`, 코스닥 `.KQ`** (혼동 주의).
- region: `US`, `KR` 지원. `JP`는 타입에만 있고 미사용.

### 4) 감성 분석 방식
- **수작업 KO/EN 키워드 사전**.
- NLTK VADER, transformers, LLM API 모두 미채택.
- 이유: 결정론적 재현, 외부 모델/네트워크 의존성 0, 한국어 형태소
  분석기 회피 (KoNLPy/Mecab 설치 마찰).

### 5) 캐시 저장 방식
- **JSON 파일** (`data/cache/{ticker}_{stock|trends|news}.json`).
- SQLite/DuckDB 미채택. 종목 수 적고 일별 row 수도 작아 DB 오버헤드 의미 없음.
- atomic write (tmp 생성 → rename) — 부분 쓰기로 인한 손상 방지.
- `.gitignore` 포함.

### 6) Python 의존성 관리
- **`venv` + `pip` + `requirements.txt`**.
- Poetry / uv / conda 미채택.
- 이유: 가장 보편적, 새 PC 셋업 마찰 최소.

### 7) 데이터 수집 트리거
- **명시적 수동 실행만**. `npm run data:*` 또는 `python3 fetch_*.py`.
- 자동 cron, API 호출 시 실시간 백그라운드 fetch 모두 없음.
- 이유:
  - pytrends 429 회피 — 사용자가 빈도를 통제
  - 디버깅 단순성 — 실패 시점/원인이 stderr에 명확히 남음
  - 사용자가 갱신 시점을 통제하는 게 분석 대시보드 톤에 더 맞음

### 8) 뉴스 데이터 소스
- **Google News RSS 한 곳만**. NewsAPI / 네이버 뉴스 / RSS+NewsAPI 병행 모두 미채택.
- API 키 불필요. region별 `hl/gl/ceid` 분기로 한/영 헤드라인 모두 수집.
- `trendsKeywords` 그룹을 `OR` 쿼리로 묶음 (`Tesla OR "TSLA stock" OR 테슬라`).
- 한계: 제목+요약만 노출돼 본문 기반 정밀 감성은 어려움 — 결정 #4와 부합.

### 9) 감성 분석 구현
- 영어: 단어 토큰 매칭 — 소문자화 후 `\b` 기준 토큰을 `POS_EN`/`NEG_EN` set과 비교.
- 한국어: 부분 문자열 매칭 — `POS_KO`/`NEG_KO` 단어가 텍스트에 포함되면 +1.
  (조사·어미 변형을 형태소 분석 없이 잡기 위해 의도적 부분 매칭)
- 사전: `scripts/python/sentiment.py` 의 4개 상수. 자유 편집 가능.
- 단위 검증 완료:
  - `"Tesla beats earnings, surges on record deliveries"` → (3, 0)
  - `"테슬라 급락, 리콜 우려 확산"` → (0, 3)

---

## 검증 안 된 영역 ❌

이 프로젝트는 **mock 데이터로만 빌드/타입체크 검증**됐다. 다음은 모두
실 환경에서 한 번도 안 돌아간 상태.

- ❌ **실 데이터 수집 한 번도 안 돌아감** (yfinance / pytrends / RSS 모두)
- ❌ 차트 마커 시각 검증 — mock에서는 가격 ±5% 급변이 거의 없어 화살표
  마커는 빈도가 낮게 보임. 실 데이터에서는 더 자주 보여야 정상.
- ❌ 한국 종목(.KS/.KQ)의 실 OHLCV가 정상 반환되는지
- ❌ pytrends 429 발생 빈도가 실사용에서 어느 정도인지 (백오프 충분한지)
- ❌ 한국어 RSS 결과의 다국어 비율, 감성 사전 재현율
- ❌ 리드/래그 상관에서 실 데이터로 의미 있는 peak가 나오는지
- ❌ Windows 환경 (지금까지는 Linux/macOS 가정으로만 검증)

---

## 다음에 해야 할 일

1. [SETUP.md](./SETUP.md) 따라 **환경 세팅**
2. **실 수집**: `npm run data:all` (또는 단계별)
3. **인스펙터로 캐시 점검**: `npm run data:inspect`
4. **UI 검증**:
   - SourceBadge 3개 채널 모두 녹색?
   - 차트 마커가 합리적인 시점에 찍히는가?
   - 이벤트 패널 클릭 → 인라인 디테일/뉴스/차트 줌 동작?
   - 상관 패널에서 peak r이 합리적인가? (mock보다 노이즈 클 가능성)
5. **이슈 발견 시**: 이 세션 이어가서 함께 수정
6. **모두 정상이면**: PR 머지 → Step 7 논의
   - 후보: 알람 (특정 종목 검색 급증 시), 다중 종목 비교 뷰,
     캐시 → SQLite 마이그, NewsAPI 옵션 추가, 한국어 형태소 분석 도입 등.

---

## 변경 이력 (요약)

| 커밋 | 단계 | 메모 |
|------|------|------|
| Step 1 | UI 스캐폴드 | mock 통합 차트, 모든 컴포넌트 골격 |
| Step 2 | yfinance | JSON 캐시 + API 폴백 |
| Step 3 | pytrends | 그룹 조회, forward-fill |
| Step 4 | RSS + 감성 | 키워드 사전, recentNews |
| Step 5 | 상관 | -7~+7 lag, 3 pair |
| Step 6 | 이벤트 마커 | 차트 마커 + 패널 클릭 |
| docs | 문서 정리 | docs/ 분리, README 슬림화 |
