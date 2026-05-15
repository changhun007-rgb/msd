// 통합 시리즈 API.
// 채널별 독립 폴백:
//   가격: yfinance 캐시 있으면 사용, 없으면 mock
//   트렌드: pytrends 캐시 있으면 가격 날짜에 정렬해 사용(미매칭은 forward-fill), 없으면 mock
//   뉴스/감성: Google News RSS 캐시 있으면 byDay를 가격 날짜에 정렬, 없으면 mock

import { NextResponse } from "next/server";
import {
  readNewsCache,
  readStockCache,
  readStockHourlyCache,
  readTrendsCache,
  readTrendsHourlyCache,
  type NewsCacheFile,
  type TrendsCacheFile,
} from "@/lib/cache";
import { buildMockSeries, mockSignalsForDates } from "@/lib/mockData";
import { readTickers } from "@/lib/tickers";
import type {
  IntegratedPoint,
  IntegratedSeries,
  Interval,
  NewsItem,
  Region,
  SourceTag,
  TickerMeta,
} from "@/types";

const RECENT_NEWS_LIMIT = 12;

export const dynamic = "force-dynamic";

// "2026-05-13T13:30:00+00:00" → "2026-05-13T13:00:00+00:00"
function toHourKey(iso: string): string {
  return iso.slice(0, 13) + ":00:00+00:00";
}

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
  const interval: Interval =
    url.searchParams.get("interval") === "1h" ? "1h" : "1d";
  const days = Math.max(
    7,
    Math.min(parseInt(url.searchParams.get("days") ?? "120", 10) || 120, 365),
  );

  const tickers = await readTickers();
  const meta: TickerMeta = tickers[ticker] ?? {
    ticker,
    display: ticker,
    region: (regionParam || "US") as Region,
    trendsKeywords: [ticker],
  };
  const region = (regionParam || meta.region) as Region;

  if (interval === "1h") {
    return getHourly(ticker, meta, region);
  }

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
  //    "검색 데이터 없음 = 빈 칸"을 일관되게 유지.
  //    캐시가 있으면 캐시 범위 밖 날짜만 null, 캐시가 아예 없으면 전부 null.
  //    (예전엔 캐시 없으면 mockSignalsForDates 로 전체 채웠지만,
  //     실데이터인 척하는 가짜 패턴이 차트에 섞이는 문제가 있었음.)
  let trendsSource: SourceTag = "mock";
  let trendValues: (number | null)[];
  if (haveTrends) {
    trendValues = alignTrends(trends, dates);
    trendsSource = "pytrends";
  } else if (priceSource === "mock") {
    // 가격까지 mock 인 "완전 데모" 모드에서만 검색량도 mock 으로.
    trendValues = sig.map((s) => s.trend);
  } else {
    trendValues = dates.map(() => null);
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
      interval: "1d",
      baseline,
      collectedAt,
      points,
      sources: { price: priceSource, trends: trendsSource, news: newsSource },
      recentNews,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

// ─── 시간봉 ────────────────────────────────────────────────────────────────
// 가격(시간봉 yfinance) + 트렌드(시간별 pytrends) + 뉴스(byHour) 를 정시 키로 정렬.
// 캐시가 없는 채널은 채우지 않고 0/null 로 비워둔다 (mock 폴백 안 함).
async function getHourly(
  ticker: string,
  meta: TickerMeta,
  region: Region,
): Promise<NextResponse> {
  const [stockH, trendsH, news] = await Promise.all([
    readStockHourlyCache(ticker),
    readTrendsHourlyCache(ticker),
    readNewsCache(ticker),
  ]);

  // 가격이 없으면 시간봉 모드는 그릴 게 없음 — 빈 응답.
  if (!stockH || stockH.points.length === 0) {
    return NextResponse.json<IntegratedSeries>(
      {
        meta,
        region,
        interval: "1h",
        baseline: { start: "", end: "" },
        collectedAt: new Date().toISOString(),
        points: [],
        sources: { price: "mock", trends: "mock", news: "mock" },
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  }

  // 가격 datetime 을 정시 키로 변환해 매칭에 사용.
  const hourKeys = stockH.points.map((p) => toHourKey(p.datetime));

  const trendMap = new Map<string, number>();
  if (trendsH) {
    for (const p of trendsH.points) {
      trendMap.set(toHourKey(p.datetime), p.trend);
    }
  }
  const haveTrendsH = trendsH != null && trendsH.points.length > 0;
  const trendValues: (number | null)[] = haveTrendsH
    ? hourKeys.map((k) => trendMap.get(k) ?? null)
    : hourKeys.map(() => null);

  const newsMap = new Map<
    string,
    { count: number; pos: number; neg: number }
  >();
  if (news?.byHour) {
    for (const h of news.byHour) {
      newsMap.set(toHourKey(h.datetime), {
        count: h.count,
        pos: h.pos,
        neg: h.neg,
      });
    }
  }
  const haveNewsH = news?.byHour != null && news.byHour.length > 0;
  const newsAligned = hourKeys.map(
    (k) => newsMap.get(k) ?? { count: 0, pos: 0, neg: 0 },
  );

  const points: IntegratedPoint[] = stockH.points.map((p, i) => ({
    date: p.datetime,
    open: p.open,
    high: p.high,
    low: p.low,
    close: p.close,
    volume: p.volume,
    trend: trendValues[i],
    newsCount: newsAligned[i].count,
    posScore: newsAligned[i].pos,
    negScore: newsAligned[i].neg,
  }));

  const recentNews = news
    ? news.items.slice(0, RECENT_NEWS_LIMIT).map((it) => ({
        date: it.date,
        publishedAt: it.publishedAt,
        title: it.title,
        link: it.link,
        source: it.source ?? null,
        pos: it.pos,
        neg: it.neg,
      }))
    : undefined;

  return NextResponse.json<IntegratedSeries>(
    {
      meta,
      region,
      interval: "1h",
      baseline: {
        start: points[0]?.date ?? "",
        end: points[points.length - 1]?.date ?? "",
      },
      collectedAt: stockH.fetchedAt,
      points,
      sources: {
        price: "yfinance",
        trends: haveTrendsH ? "pytrends" : "mock",
        news: haveNewsH ? "google-news-rss" : "mock",
      },
      recentNews,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
