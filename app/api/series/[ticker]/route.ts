// 통합 시리즈 API.
// Step 2: 가격은 yfinance 캐시(없으면 mock), 트렌드/뉴스/감성은 mock.
// Step 3,4에서 trends/news 채널을 실데이터로 교체.

import { NextResponse } from "next/server";
import tickersJson from "@/data/keywords/tickers.json";
import { readStockCache } from "@/lib/cache";
import { buildMockSeries, mockSignalsForDates } from "@/lib/mockData";
import type {
  IntegratedPoint,
  IntegratedSeries,
  Region,
  TickerMeta,
} from "@/types";

const TICKERS = tickersJson as Record<string, TickerMeta>;

// 정적 빌드 시 평가되지 않도록 동적 실행
export const dynamic = "force-dynamic";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ ticker: string }> },
) {
  const { ticker } = await params;
  const url = new URL(req.url);
  const regionParam = (url.searchParams.get("region") ?? "").toUpperCase();
  const days = Math.max(
    7,
    Math.min(parseInt(url.searchParams.get("days") ?? "120", 10) || 120, 365),
  );

  const meta: TickerMeta = TICKERS[ticker] ?? {
    ticker,
    display: ticker,
    region: (regionParam || "US") as Region,
    trendsKeywords: [ticker],
  };
  const region = (regionParam || meta.region) as Region;

  const cache = await readStockCache(ticker);

  if (!cache || cache.points.length === 0) {
    // 완전 mock 폴백
    const mock = buildMockSeries(ticker, region, days);
    const out: IntegratedSeries = {
      ...mock,
      sources: { price: "mock", trends: "mock", news: "mock" },
    };
    return NextResponse.json(out, {
      headers: { "Cache-Control": "no-store" },
    });
  }

  // 가격은 실데이터, trend/news/감성은 mock으로 채움
  const tail = cache.points.slice(-days);
  const dates = tail.map((p) => p.date);
  const sig = mockSignalsForDates(ticker, region, dates);

  const points: IntegratedPoint[] = tail.map((p, i) => ({
    date: p.date,
    open: p.open,
    high: p.high,
    low: p.low,
    close: p.close,
    volume: p.volume,
    trend: sig[i].trend,
    newsCount: sig[i].newsCount,
    posScore: sig[i].posScore,
    negScore: sig[i].negScore,
  }));

  const out: IntegratedSeries = {
    meta,
    region,
    baseline: {
      start: dates[0] ?? "",
      end: dates[dates.length - 1] ?? "",
    },
    collectedAt: cache.fetchedAt,
    points,
    sources: { price: "yfinance", trends: "mock", news: "mock" },
  };

  return NextResponse.json(out, {
    headers: { "Cache-Control": "no-store" },
  });
}
