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

// 차트의 시간 해상도
export type Interval = "1d" | "1h";

// 통합 차트 1행을 표현하는 융합 레코드
export interface IntegratedPoint {
  // 일봉: "YYYY-MM-DD", 시간봉: "YYYY-MM-DDTHH:MM:SS+00:00" (UTC ISO)
  date: string;
  // 가격/거래량
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  // 관심 시그널
  // trend 는 null 가능 — 캐시 범위 밖이면 mock 으로 채우지 않고 빈 칸으로 둔다.
  trend: number | null;   // Google Trends 0-100
  newsCount: number;
  posScore: number;
  negScore: number;
}

// 통합 시리즈 + 메타
export interface IntegratedSeries {
  meta: TickerMeta;
  region: Region;
  interval: Interval;      // 일봉/시간봉
  baseline: { start: string; end: string };
  collectedAt: string;     // 수집 시점
  points: IntegratedPoint[];
  sources?: SeriesSources; // 각 채널의 출처 (mock/실데이터 구분)
  recentNews?: NewsItem[]; // 실 뉴스 캐시가 있을 때만 (최근 N개, publishedAt desc)
}

export type SourceTag =
  | "mock"
  | "yfinance"
  | "pytrends"
  | "google-news-rss"
  | "newsapi";

export interface SeriesSources {
  price: SourceTag;
  trends: SourceTag;
  news: SourceTag;
}

export interface NewsItem {
  date: string;          // YYYY-MM-DD (UTC)
  publishedAt: string;   // ISO
  title: string;
  link: string;
  source?: string | null;
  pos: number;
  neg: number;
}
