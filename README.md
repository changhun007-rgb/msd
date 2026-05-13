# 시장 심리 흐름 시각화 대시보드

가격을 예측하는 시스템이 아닙니다. **시장 심리와 관심 흐름을 시각적으로
관찰**하기 위한 대시보드입니다. 검색량 · 뉴스량 · 감성 · 거래량 · 가격을
하나의 날짜축 위에서 비교해, 관심의 확산 / 과열 / 비대칭을 눈으로 읽는 데
초점을 둡니다.

> 매수/매도 추천이 아닙니다. "오를 확률" 같은 단정적 표현은 사용하지
> 않습니다.

## 현재 상태

- **Step 1**: Next.js + Tailwind + lightweight-charts 셋업, Mock 통합 차트 골격.
- **Step 2**: yfinance Python 수집기 + JSON 캐시 + Next.js API 라우트.
  가격은 캐시가 있으면 yfinance 실데이터, 없으면 mock 폴백.
- **Step 3**: pytrends 연동. 종목별 trendsKeywords 그룹을 한 번에 조회해
  평균낸 일별 시계열 + sma7 + wow + 기준기간(geo/timeframe) 저장. API는
  가격 날짜에 trend를 정렬하고 미매칭은 forward-fill, 그래도 없으면 mock 폴백.
- **Step 4 (현재)**: Google News RSS + 키워드 사전 기반(KO/EN) 감성 분석.
  region별 RSS 피드를 가져와 일자별 count/pos/neg 집계 + 최근 기사 목록
  저장. NewsPanel은 실 데이터가 있으면 클릭 가능한 헤드라인을, 없으면
  mock 헤드라인을 표시.
- Step 5: 리드/래그(-7~+7일) 상관 히트맵.
- Step 6: 차트 위 이벤트 마커.

## 실행

### 1) 프런트엔드 (mock으로도 동작)

```bash
npm install
npm run dev
# http://localhost:3000
```

### 2) 실 주가 데이터 수집 (yfinance)

Python 3.10+ 권장.

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r scripts/python/requirements.txt

# 전체 종목
npm run data:stocks
# 또는 특정 종목만
python3 scripts/python/fetch_stock.py TSLA 005930.KS
```

결과는 `data/cache/{ticker}_stock.json`에 적재되고, 다음 페이지 새로고침부터
가격 채널이 자동으로 `yfinance`로 표시됩니다 (좌상단 SourceBadge).

### 3) 검색 관심도 수집 (pytrends, Google Trends 비공식)

```bash
# 전체 종목 (8초 간격으로 종목 간 sleep — 429 회피)
npm run data:trends
# 특정 종목만
python3 scripts/python/fetch_trends.py TSLA
```

결과는 `data/cache/{ticker}_trends.json`에 `today 3-m`(약 90일) 일별
시계열로 저장됩니다 (그룹 키워드 평균, sma7, wow 포함). 캐시가 비어 있는
종목은 trend 채널이 mock으로 폴백되며, pytrends는 비공식 API라
**API 호출 시 실시간 수집은 하지 않습니다** — 명시적 `npm run data:trends`
실행이 필요합니다.

### 4) 뉴스 + 감성 수집 (Google News RSS, 무료, 키 불필요)

```bash
npm run data:news
# 또는 특정 종목만
python3 scripts/python/fetch_news.py TSLA 005930.KS
```

- region이 `KR`이면 `hl=ko&gl=KR&ceid=KR:ko`, `US`면 `hl=en-US&gl=US&ceid=US:en`
- trendsKeywords 그룹을 OR로 묶어 검색 — 다국어 헤드라인을 함께 수집
- 결과는 `data/cache/{ticker}_news.json` (items + byDay 집계)
- 감성 점수는 `scripts/python/sentiment.py`의 KO/EN 키워드 사전 기반.
  형태소 분석기 없이 결정론적으로 동작하지만 정밀도는 거칠다는 점에 유의.

### 한 번에 전부

```bash
npm run data:all   # stock → trends → news 순차 실행
```

빌드 검증:

```bash
npm run build
```

## 폴더 구조

```
app/                Next.js App Router (대시보드 UI + 추후 캐시 read API)
components/         UI 컴포넌트 (차트, 토글, 패널)
lib/                지표 / 감성 / Mock / (추후) 캐시 read
types/              공용 타입
data/keywords/      ticker → 다국어 트렌드 키워드 매핑
data/cache/         (추후) Python 수집기가 적재하는 SQLite/JSON
scripts/python/     yfinance · pytrends · Google News RSS 수집 스크립트
  fetch_stock.py   yfinance 일봉 OHLCV → data/cache/{ticker}_stock.json
  fetch_trends.py  pytrends 그룹 키워드 → data/cache/{ticker}_trends.json
  fetch_news.py    Google News RSS + 감성 점수 → data/cache/{ticker}_news.json
  sentiment.py     KO/EN 키워드 사전 기반 감성 점수기 (의존성 없음)
  common.py        경로/티커 로더/JSON atomic write 공용 유틸
  scheduler.py     모든 수집기 일괄 실행 (cron 대체)
  requirements.txt 의존성
app/api/series/[ticker]/  통합 시리즈 read 라우트 (캐시 + mock 폴백)
```

## 데이터 출처와 제약 (참고)

- **Yahoo Finance / yfinance**: 무료지만 비공식. 한국 종목은 `.KS`(코스피)
  `.KQ`(코스닥) 접미사 필요. 예: `005930.KS` (삼성전자).
- **Google Trends / pytrends**: **비공식 API**. 절대 검색량이 아닌
  **선택 기간·지역 내 최대값=100으로 정규화된 상대 관심도**입니다.
  요청 시점에 따라 값이 재정규화될 수 있으므로 본 프로젝트는
  *원본·이동평균·증가율·기준기간*을 함께 저장해 컨텍스트를 보존합니다.
- **뉴스**: Google News RSS / NewsAPI / 네이버 뉴스 (Step 4 예정).

## 디자인 원칙

- 트레이딩 앱이 아닌 **분석 대시보드** 톤. 채도 낮은 중립 팔레트, 단일 액센트.
- 표현은 항상 *관찰* 중심: "관심 증가", "거래량 동반", "검색 지속성",
  "과열 가능성", "비대칭". 예측/추천 단어 금지.

## 라이선스

WIP. 비상업적 학습 용도로 작성 중.
