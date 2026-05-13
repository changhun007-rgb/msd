// Mock 통합 시계열 생성기
// Step 1에서 UI 골격을 채우기 위한 합성 데이터.
// 가격이 먼저 움직이는 케이스와 검색량이 먼저 움직이는 케이스를
// 의도적으로 섞어 리드/래그·비대칭 패턴이 눈에 들어오도록 만든다.

import tickersJson from "@/data/keywords/tickers.json";
import type {
  IntegratedPoint,
  IntegratedSeries,
  Region,
  TickerMeta,
} from "@/types";

const TICKERS = tickersJson as Record<string, TickerMeta>;

export function listTickers(): TickerMeta[] {
  return Object.values(TICKERS);
}

export function getTickerMeta(symbol: string): TickerMeta | null {
  return TICKERS[symbol] ?? null;
}

// 결정론적 난수 (seed). 같은 ticker는 항상 같은 mock 시리즈 생성.
function seeded(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
}

function hashSeed(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = (h * 16777619) >>> 0;
  }
  return h;
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function buildMockSeries(
  symbol: string,
  region: Region,
  days = 120,
): IntegratedSeries {
  const meta = TICKERS[symbol] ?? {
    ticker: symbol,
    display: symbol,
    region,
    trendsKeywords: [symbol],
  };
  const rand = seeded(hashSeed(symbol + region));

  const points: IntegratedPoint[] = [];
  const end = new Date();
  end.setUTCHours(0, 0, 0, 0);

  let close = 80 + rand() * 120;
  // 관심도 sin 파동 + 가격에 lag 반영
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(end);
    d.setUTCDate(end.getUTCDate() - i);
    // 주말 스킵
    const dow = d.getUTCDay();
    if (dow === 0 || dow === 6) continue;

    const idx = days - 1 - i;
    const wave = Math.sin(idx / 9) * 15 + 50;
    const noise = (rand() - 0.5) * 12;
    const trend = Math.max(0, Math.min(100, wave + noise));

    // 검색량이 가격을 약간 리드하도록 lag 4일
    const priceWave = Math.sin((idx - 4) / 9) * 0.02;
    const drift = (rand() - 0.48) * 0.01;
    close = Math.max(5, close * (1 + priceWave + drift));
    const open = close * (1 + (rand() - 0.5) * 0.008);
    const high = Math.max(open, close) * (1 + rand() * 0.012);
    const low = Math.min(open, close) * (1 - rand() * 0.012);
    const volume = Math.round(
      1_000_000 * (1 + trend / 80 + rand() * 0.4),
    );

    // 뉴스량은 trend의 후행 (lag 1-2일)
    const trendLag = points.length >= 2 ? points[points.length - 2].trend : trend;
    const newsBase = trendLag / 8;
    const newsCount = Math.max(0, Math.round(newsBase + rand() * 5));

    // 감성: 가격 일간 변화에 약하게 연동 + 노이즈
    const prevClose = points.length ? points[points.length - 1].close : close;
    const dailyRet = (close - prevClose) / prevClose;
    const posScore = Math.max(0, Math.round(newsCount * 0.55 + dailyRet * 30 + rand() * 2));
    const negScore = Math.max(0, Math.round(newsCount * 0.4 - dailyRet * 30 + rand() * 2));

    points.push({
      date: isoDate(d),
      open: round2(open),
      high: round2(high),
      low: round2(low),
      close: round2(close),
      volume,
      trend: Math.round(trend),
      newsCount,
      posScore,
      negScore,
    });
  }

  const baselineStart = points[0]?.date ?? isoDate(end);
  const baselineEnd = points[points.length - 1]?.date ?? isoDate(end);

  return {
    meta,
    region,
    baseline: { start: baselineStart, end: baselineEnd },
    collectedAt: new Date().toISOString(),
    points,
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
