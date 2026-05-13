// 통합 시리즈 API.
// 채널별 독립 폴백:
//   가격: yfinance 캐시 있으면 사용, 없으면 mock
//   트렌드: pytrends 캐시 있으면 가격 날짜에 정렬해 사용(미매칭은 forward-fill), 없으면 mock
//   뉴스/감성: Google News RSS 캐시 있으면 byDay를 가격 날짜에 정렬, 없으면 mock

import { NextResponse } from "next/server";
import tickersJson from "@/data/keywords/tickers.json";
import {
  readNewsCache,
  readStockCache,
  readTrendsCache,
  type NewsCacheFile,
  type TrendsCacheFile,
} from "@/lib/cache";
import { buildMockSeries, mockSignalsForDates } from "@/lib/mockData";
import type {
  IntegratedPoint,
  IntegratedSeries,
  NewsItem,
  Region,
  SourceTag,
  TickerMeta,
} from "@/types";

const TICKERS = tickersJson as Record<string, TickerMeta>;
const RECENT_NEWS_LIMIT = 12;

export const dynamic = "force-dynamic";

// 가격 dates 순서대로 trend 캐시 값을 매칭. 정확 일치 우선, 없으면 직전 last known 값(forward-fill).
function alignTrends(
  cache: TrendsCacheFile,
  priceDates: string[],
): (number | null)[] {
  const map = new Map<string, number>();
  for (const p of cache.points) map.set(p.date, p.trend);

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
    let lastKnown: number | null = null;
    for (const c of sortedCache) {
      if (c.date <= d) lastKnown = c.trend;
      else break;
    }
    out.push(lastKnown);
  }
  return out;
}

interface DailySignal {
  count: number;
  pos: number;
  neg: number;
}

// 뉴스 byDay를 가격 dates에 정렬. 미매칭은 0(뉴스 없음)으로 명시 — forward-fill 안 함.
function alignNewsByDay(
  cache: NewsCacheFile,
  priceDates: string[],
): DailySignal[] {
  const map = new Map<string, DailySignal>();
  for (const d of cache.byDay) {
    map.set(d.date, { count: d.count, pos: d.pos, neg: d.neg });
  }
  return priceDates.map(
    (d) => map.get(d) ?? { count: 0, pos: 0, neg: 0 },
  );
}

function recentNewsFromCache(cache: NewsCacheFile): NewsItem[] {
  return cache.items.slice(0, RECENT_NEWS_LIMIT).map((it) => ({
    date: it.date,
    publishedAt: it.publishedAt,
    title: it.title,
    link: it.link,
    source: it.source ?? null,
    pos: it.pos,
    neg: it.neg,
  }));
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

  const [stock, trends, news] = await Promise.all([
    readStockCache(ticker),
    readTrendsCache(ticker),
    readNewsCache(ticker),
  ]);

  const haveStock = stock && stock.points.length > 0;
  const haveTrends = trends && trends.points.length > 0;
  const haveNews = news && news.byDay.length > 0;

  // 1) 가격 timeline 결정 (실데이터 또는 mock)
  let dates: string[];
  let priceRows: IntegratedPoint[];
  let priceSource: SourceTag;
  let collectedAt: string;
  let baseline: { start: string; end: string };

  if (haveStock) {
    const tail = stock.points.slice(-days);
    dates = tail.map((p) => p.date);
    priceRows = tail.map((p) => ({
      date: p.date,
      open: p.open,
      high: p.high,
      low: p.low,
      close: p.close,
      volume: p.volume,
      trend: 0,
      newsCount: 0,
      posScore: 0,
      negScore: 0,
    }));
    priceSource = "yfinance";
    collectedAt = stock.fetchedAt;
    baseline = { start: dates[0] ?? "", end: dates[dates.length - 1] ?? "" };
  } else {
    const mock = buildMockSeries(ticker, region, days);
    dates = mock.points.map((p) => p.date);
    priceRows = mock.points;
    priceSource = "mock";
    collectedAt = mock.collectedAt;
    baseline = mock.baseline;
  }

  // 2) Mock signal은 캐시가 비는 채널의 폴백 자료로만 사용
  const sig = mockSignalsForDates(ticker, region, dates);

  // 3) Trend 채널 채우기
  let trendsSource: SourceTag = "mock";
  let trendValues: number[];
  if (haveTrends) {
    const aligned = alignTrends(trends, dates);
    trendValues = aligned.map((v, i) => (v == null ? sig[i].trend : v));
    trendsSource = "pytrends";
  } else {
    trendValues = sig.map((s) => s.trend);
  }

  // 4) News/감성 채널 채우기
  let newsSource: SourceTag = "mock";
  let newsCounts: number[];
  let posScores: number[];
  let negScores: number[];
  let recentNews: NewsItem[] | undefined;

  if (haveNews) {
    const aligned = alignNewsByDay(news, dates);
    newsCounts = aligned.map((s) => s.count);
    posScores = aligned.map((s) => s.pos);
    negScores = aligned.map((s) => s.neg);
    recentNews = recentNewsFromCache(news);
    newsSource = "google-news-rss";
  } else {
    newsCounts = sig.map((s) => s.newsCount);
    posScores = sig.map((s) => s.posScore);
    negScores = sig.map((s) => s.negScore);
  }

  const points: IntegratedPoint[] = priceRows.map((p, i) => ({
    ...p,
    trend: trendValues[i],
    newsCount: newsCounts[i],
    posScore: posScores[i],
    negScore: negScores[i],
  }));

  return NextResponse.json<IntegratedSeries>(
    {
      meta,
      region,
      baseline,
      collectedAt,
      points,
      sources: { price: priceSource, trends: trendsSource, news: newsSource },
      recentNews,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
