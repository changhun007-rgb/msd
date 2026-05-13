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
  평균낸 일별 시계열 + sma7 + wow + 기준기간(geo/timeframe) 저장.
- **Step 4**: Google News RSS + 키워드 사전 기반(KO/EN) 감성 분석.
  region별 RSS 피드 + 일자별 count/pos/neg 집계 + 최근 기사 목록.
- **Step 5 (현재)**: 리드/래그 −7 ~ +7일 상관 분석. 검색·뉴스 시그널이
  가격 수익률·거래량을 며칠 선행/후행하는 "경향"을 히트맵·바차트·테이블로
  제시 (예측 아님).
- Step 6: 차트 위 이벤트 마커.

## 빠른 시작 (새 컴퓨터에서 처음 받았다면)

### 사전 요구

| 도구 | 권장 버전 | 비고 |
|------|----------|------|
| Node.js | **20 LTS 이상** | `npm` 동봉. `nvm`이나 공식 설치본 권장. |
| Python | **3.10 이상** | f-string union 타입(`str \| None`) 사용. |
| Git | 최신 | |
| OS | macOS / Linux / WSL2 | Windows 네이티브도 가능하지만 venv 활성화 명령만 다름. |

확인:
```bash
node --version    # v20+ 이어야 함
python3 --version # 3.10+
```

### 1) 클론 + Node 의존성

```bash
git clone <repo-url> msd
cd msd
npm install
```

### 2) Python 가상환경 + 수집 의존성

```bash
python3 -m venv .venv
source .venv/bin/activate          # Windows PowerShell: .venv\Scripts\Activate.ps1
pip install -r scripts/python/requirements.txt
```

설치되는 것: `yfinance`, `pandas`, `pytrends`, `feedparser`, `python-dateutil`.

> `.venv` 와 `data/cache/` 는 `.gitignore`에 포함되어 있어 커밋되지 않습니다.

### 3) (선택) 종목 목록 편집

`data/keywords/tickers.json` 에 종목과 다국어 트렌드 키워드를 정의합니다.
기본 5개(TSLA, NVDA, AAPL, 005930.KS, 086520.KQ)가 들어있고, 추가/수정
자유.

```jsonc
"247540.KQ": {
  "ticker": "247540.KQ",
  "display": "에코프로비엠",
  "region": "KR",
  "trendsKeywords": ["에코프로비엠", "EcoPro BM", "247540"]
}
```

> 한국 종목은 **코스피=`.KS`, 코스닥=`.KQ`** 접미사가 필수. 잘못된 접미사를
> 쓰면 yfinance가 빈 데이터를 돌려줍니다.

### 4) 데이터 한 번에 수집

```bash
# venv 활성화 상태에서
npm run data:all          # stock → trends → news 순차 실행 (5종목 약 1~2분)
```

개별 실행도 가능:
```bash
npm run data:stocks       # yfinance 6개월 일봉
npm run data:trends       # pytrends today 3-m (8s 종목 간격)
npm run data:news         # Google News RSS + 감성
npm run data:inspect      # 캐시 파일들 한 줄 요약 (점검용)
```

특정 종목만:
```bash
python3 scripts/python/fetch_stock.py TSLA
python3 scripts/python/fetch_trends.py 005930.KS
```

### 5) Next.js 개발 서버

```bash
npm run dev
# http://localhost:3000
```

좌상단 **SourceBadge**가 각 채널(가격/검색/뉴스)의 출처를 표시합니다.
- 녹색: 실데이터 (yfinance / pytrends / google-news-rss)
- 노란색: 캐시 없음 → mock 폴백

### 6) 빌드 확인

```bash
npm run build
```

## 자주 발생하는 에러

### "pytrends 429 / TooManyRequests"
- pytrends는 비공식 API라 가장 자주 막힙니다.
- 종목 간 8초 sleep + 내부 backoff 2회를 깔아두었지만, 단기 IP 차단을 받으면
  몇십 분~몇 시간 후 풀립니다.
- 대안:
  1. 종목 하나씩 따로 실행: `python3 scripts/python/fetch_trends.py TSLA`
  2. VPN/네트워크 전환 후 재시도
  3. trends 캐시가 없는 종목은 trend 채널만 mock으로 폴백 — stock/news는 영향 없음

### "yfinance `0 rows` 출력"
- 접미사 확인 (`.KS` vs `.KQ`)
- Yahoo Finance 페이지에 직접 들어가 종목 페이지가 존재하는지 확인:
  `https://finance.yahoo.com/quote/<TICKER>`
- 장 마감 직후 당일 데이터가 비어있을 수 있음 — 다음 날 재시도

### "Google News RSS 결과가 영어로만 나옴"
- `tickers.json`의 region이 `KR` 인지 확인
- 브라우저에서 직접 RSS URL을 열어 결과를 검증:
  ```
  https://news.google.com/rss/search?q=삼성전자&hl=ko&gl=KR&ceid=KR:ko
  ```

### "Node version too old"
- `npm install`이 실패하면 Node 20 LTS 이상으로 업그레이드. Next.js 16은
  Node 18.18+ 가 필수이고, 권장은 20+.

### "ModuleNotFoundError: No module named 'yfinance'"
- venv를 활성화하지 않았을 가능성이 큽니다. `source .venv/bin/activate`
  먼저. 프롬프트 앞에 `(.venv)` 가 보이는지 확인.

### "캐시 파일은 있는데 페이지에 mock 배지가 그대로"
- 페이지를 새로고침 (캐시는 `no-store`로 설정되어 있어 즉시 반영)
- `npm run data:inspect <티커>` 로 캐시가 실제로 데이터가 있는지 확인
- 라우트 캐시 의심되면 dev 서버 재시작 (`Ctrl+C` 후 `npm run dev`)

## 폴더 구조

```
app/                       Next.js App Router
  page.tsx                 대시보드 메인
  api/series/[ticker]/     통합 시리즈 read API (캐시 + mock 폴백)
components/                UI 컴포넌트 (차트, 토글, 패널, 상관 분석)
lib/                       지표 / 감성 / Mock / 캐시 read / 상관 계산
  correlation.ts           lead/lag pearson 분석
  cache.ts                 server-only 캐시 reader
  mockData.ts              결정론적 합성 시리즈
types/                     공용 타입
data/keywords/tickers.json ticker → 다국어 트렌드 키워드 매핑
data/cache/                Python 수집기가 적재 (gitignore)
scripts/python/
  fetch_stock.py           yfinance 일봉 OHLCV
  fetch_trends.py          pytrends 그룹 키워드
  fetch_news.py            Google News RSS + 감성 점수
  sentiment.py             KO/EN 키워드 사전 (외부 NLP 의존성 없음)
  inspect_cache.py         캐시 한 줄 요약 (디버그)
  common.py                경로/티커 로더/JSON atomic write
  scheduler.py             모든 수집기 일괄 실행
  requirements.txt
```

## 데이터 출처와 제약

- **Yahoo Finance / yfinance**: 무료지만 비공식. 한국 종목은 `.KS`(코스피)
  `.KQ`(코스닥) 접미사 필요. 예: `005930.KS` (삼성전자).
- **Google Trends / pytrends**: **비공식 API**. 절대 검색량이 아닌
  **선택 기간·지역 내 최대값=100으로 정규화된 상대 관심도**입니다.
  요청 시점에 따라 값이 재정규화될 수 있으므로 본 프로젝트는
  *원본·이동평균·증가율·기준기간*을 함께 저장해 컨텍스트를 보존합니다.
- **Google News RSS**: 무료, 키 불필요. 결과는 제목+요약만 노출되므로
  본문 기반 정밀 감성 분석은 어렵습니다 — 본 프로젝트는 KO/EN 키워드
  사전으로 거친 점수만 산출.

## 디자인 원칙

- 트레이딩 앱이 아닌 **분석 대시보드** 톤. 채도 낮은 중립 팔레트, 단일 액센트.
- 색상은 의미가 있는 곳(부호 +/-)에만. 양의 상관은 emerald, 음의 상관은
  rose, 무관/null은 중립 회색.
- 표현은 항상 *관찰* 중심: "관심 증가", "거래량 동반", "검색 지속성",
  "과열 가능성", "비대칭". 예측/추천 단어 금지.

## 라이선스

WIP. 비상업적 학습 용도로 작성 중.
