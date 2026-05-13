# 시장 심리 흐름 시각화 대시보드

가격을 예측하는 시스템이 아닙니다. **시장 심리와 관심 흐름을 시각적으로
관찰**하기 위한 대시보드입니다. 검색량 · 뉴스량 · 감성 · 거래량 · 가격을
하나의 날짜축 위에서 비교해, 관심의 확산 / 과열 / 비대칭을 눈으로 읽는 데
초점을 둡니다.

> 매수/매도 추천이 아닙니다. "오를 확률" 같은 단정적 표현은 사용하지
> 않습니다.

## 현재 상태

- **Step 1**: Next.js + Tailwind + lightweight-charts 셋업, Mock 통합 차트 골격.
- **Step 2 (현재)**: yfinance Python 수집기 + JSON 캐시 + Next.js API 라우트.
  가격은 캐시가 있으면 yfinance 실데이터, 없으면 mock 폴백. trends/news는 여전히 mock.
- Step 3: pytrends 연동 + 캐싱(원본/이동평균/증가율/기준기간 모두 저장).
- Step 4: Google News RSS + 키워드 기반 감성 분석.
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
scripts/python/     yfinance(완) · pytrends(예정) · news(예정) 수집 스크립트
  fetch_stock.py   yfinance 일봉 OHLCV → data/cache/{ticker}_stock.json
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
