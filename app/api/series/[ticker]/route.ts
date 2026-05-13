// 통합 시리즈 API.
// 채널별 독립 폴백:
//   가격: yfinance 캐시 있으면 사용, 없으면 mock
//   트렌드: pytrends 캐시 있으면 가격 날짜에 정렬해 사용(미매칭은 forward-fill), 없으면 mock
//   뉴스/감성: 여전히 mock (Step 4에서 교체)

import { NextResponse } from "next/server";
import tickersJson from "@/data/keywords/tickers.json";
import {
  readStockCache,
  readTrendsCache,
  type TrendsCacheFile,
} from "@/lib/cache";
import { buildMockSeries, mockSignalsForDates } from "@/lib/mockData";
import type {
  IntegratedPoint,
  IntegratedSeries,
  Region,
  SourceTag,
  TickerMeta,
} from "@/types";

const TICKERS = tickersJson as Record<string, TickerMeta>;

export const dynamic = "force-dynamic";

// 가격 dates 순서대로 trend 캐시 값을 매칭. 정확 일치 우선, 없으면 직전 last known 값(forward-fill).
// 그래도 없으면 null을 반환 → 호출 측에서 mock signal로 대체.
function alignTrends(
  cache: TrendsCacheFile,
  priceDates: string[],
): (number | null)[] {
  const map = new Map<string, number>();
  for (const p of cache.points) map.set(p.date, p.trend);

  // 캐시 dates를 정렬 (이미 정렬되어 있다고 가정하되 방어적으로)
  const sortedCache = [...cache.points].sort((a, b) =>
    a.date.localeCompare(b.date),
  );

  const out: (number | null)[] = [];
  for (const d of priceDates) {
    const exact = map.get(d);
    if (exact !== undefined) {
      out.push(exact);
      continue;
    }
    // forward-fill: 캐시 내에서 d 이하인 마지막 항목
    let lastKnown: number | null = null;
    for (const c of sortedCache) {
      if (c.date <= d) lastKnown = c.trend;
      else break;
    }
    out.push(lastKnown);
  }
  return out;
}

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

  const [stock, trends] = await Promise.all([
    readStockCache(ticker),
    readTrendsCache(ticker),
  ]);

  // 가격이 아예 없으면 전체 mock + (있으면 trends만 부분 합성)
  if (!stock || stock.points.length === 0) {
    const mock = buildMockSeries(ticker, region, days);

    let trendsSource: SourceTag = "mock";
    if (trends && trends.points.length > 0) {
      const aligned = alignTrends(trends, mock.points.map((p) => p.date));
      mock.points = mock.points.map((p, i) =>
        aligned[i] != null ? { ...p, trend: aligned[i] as number } : p,
      );
      trendsSource = "pytrends";
    }

    return NextResponse.json<IntegratedSeries>(
      {
        ...mock,
        sources: { price: "mock", trends: trendsSource, news: "mock" },
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  }

  // 가격 실데이터 + (trend는 캐시 있으면 정렬, 없으면 mock signal)
  const tail = stock.points.slice(-days);
  const dates = tail.map((p) => p.date);
  const sig = mockSignalsForDates(ticker, region, dates);

  let trendValues: number[] = sig.map((s) => s.trend);
  let trendsSource: SourceTag = "mock";
  if (trends && trends.points.length > 0) {
    const aligned = alignTrends(trends, dates);
    trendValues = aligned.map((v, i) => (v == null ? sig[i].trend : v));
    trendsSource = "pytrends";
  }

  const points: IntegratedPoint[] = tail.map((p, i) => ({
    date: p.date,
    open: p.open,
    high: p.high,
    low: p.low,
    close: p.close,
    volume: p.volume,
    trend: trendValues[i],
    newsCount: sig[i].newsCount,
    posScore: sig[i].posScore,
    negScore: sig[i].negScore,
  }));

  return NextResponse.json<IntegratedSeries>(
    {
      meta,
      region,
      baseline: {
        start: dates[0] ?? "",
        end: dates[dates.length - 1] ?? "",
      },
      collectedAt: stock.fetchedAt,
      points,
      sources: { price: "yfinance", trends: trendsSource, news: "mock" },
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
