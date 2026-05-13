// 시장 심리 흐름 시각화 대시보드 - 공용 타입 정의
// 단계: Step 1 (Mock) → Step 2~4에서 동일한 타입을 실데이터로 채운다

export type Region = "US" | "KR" | "JP";

export interface TickerMeta {
  ticker: string;          // yfinance 기준. 예: TSLA, 005930.KS
  display: string;         // UI 표시명. 예: Tesla, 삼성전자
  region: Region;
  trendsKeywords: string[]; // pytrends 다국어 키워드. 예: ["Tesla","TSLA stock","테슬라"]
}

export interface OHLCV {
  date: string;   // ISO date (YYYY-MM-DD)
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

// Google Trends는 절대 검색량이 아닌 상대 지표.
// 원본/이동평균/증가율/기준기간을 함께 저장해 재정규화 영향을 명시한다.
export interface TrendPoint {
  date: string;
  value: number;            // 0-100 (Google Trends 원본 값)
  ma7?: number;             // 7일 이동평균
  changePct?: number;       // 전일 대비 증가율 (%)
  baselineStart: string;    // 기준 기간 시작 (이 정규화의 컨텍스트)
  baselineEnd: string;      // 기준 기간 끝
}

export interface NewsItem {
  date: string;        // ISO date
  title: string;
  source: string;
  url?: string;
  summary?: string;
  posScore: number;    // 키워드 기반 양성 점수
  negScore: number;    // 키워드 기반 음성 점수
}

export interface DailySentiment {
  date: string;
  newsCount: number;
  posScoreSum: number;
  negScoreSum: number;
  posCount: number;    // posScore > negScore 인 기사 수
  negCount: number;
}

// 통합 차트 1행을 표현하는 융합 레코드
export interface IntegratedPoint {
  date: string;
  // 가격/거래량
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  // 관심 시그널
  trend: number;          // Google Trends 0-100
  newsCount: number;
  posScore: number;
  negScore: number;
}

// 통합 시리즈 + 메타
export interface IntegratedSeries {
  meta: TickerMeta;
  region: Region;
  baseline: { start: string; end: string };
  collectedAt: string;     // 수집 시점
  points: IntegratedPoint[];
}
