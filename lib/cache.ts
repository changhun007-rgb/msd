// 서버 전용 캐시 reader.
// Python 수집기가 data/cache/{ticker}_stock.json 에 적재한 결과를 읽는다.
// 로컬에서는 파일시스템, 배포 환경에서는 GitHub raw 에서 읽는다 (lib/dataSource).
// 이 모듈은 server-only — 클라이언트 컴포넌트에서 import 하지 말 것.

import { readCacheText } from "@/lib/dataSource";

export interface StockPoint {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface StockHourlyPoint extends StockPoint {
  datetime: string; // UTC ISO "2026-05-13T14:30:00+00:00"
}

export interface StockCacheFile {
  ticker: string;
  fetchedAt: string;
  period: string;
  interval: string;
  points: StockPoint[];
}

export interface StockHourlyCacheFile extends Omit<StockCacheFile, "points"> {
  points: StockHourlyPoint[];
}

function safeName(ticker: string): string {
  return Array.from(ticker)
    .map((c) => (/[a-zA-Z0-9._-]/.test(c) ? c : "_"))
    .join("");
}

// 캐시 파일 텍스트를 읽어 JSON 파싱. 파싱 실패/부재 시 null.
async function readJson<T>(
  filename: string,
  validate: (v: T) => boolean,
): Promise<T | null> {
  const text = await readCacheText(filename);
  if (text == null) return null;
  try {
    const parsed = JSON.parse(text) as T;
    return validate(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export async function readStockCache(
  ticker: string,
): Promise<StockCacheFile | null> {
  return readJson<StockCacheFile>(
    `${safeName(ticker)}_stock.json`,
    (p) => Array.isArray(p.points),
  );
}

export async function readStockHourlyCache(
  ticker: string,
): Promise<StockHourlyCacheFile | null> {
  return readJson<StockHourlyCacheFile>(
    `${safeName(ticker)}_stock_1h.json`,
    (p) => Array.isArray(p.points),
  );
}

export interface TrendsPoint {
  date: string;
  trend: number;
  sma7?: number | null;
  wow?: number | null;
}

export interface TrendsHourlyPoint {
  datetime: string; // UTC ISO
  trend: number;
}

export interface TrendsCacheFile {
  ticker: string;
  geo: string;
  timeframe: string;
  keywords: string[];
  fetchedAt: string;
  points: TrendsPoint[];
}

export interface TrendsHourlyCacheFile
  extends Omit<TrendsCacheFile, "points"> {
  points: TrendsHourlyPoint[];
}

export async function readTrendsCache(
  ticker: string,
): Promise<TrendsCacheFile | null> {
  return readJson<TrendsCacheFile>(
    `${safeName(ticker)}_trends.json`,
    (p) => Array.isArray(p.points),
  );
}

export async function readTrendsHourlyCache(
  ticker: string,
): Promise<TrendsHourlyCacheFile | null> {
  return readJson<TrendsHourlyCacheFile>(
    `${safeName(ticker)}_trends_hourly.json`,
    (p) => Array.isArray(p.points),
  );
}

export interface NewsItemCache {
  date: string;
  publishedAt: string;
  title: string;
  link: string;
  source?: string | null;
  pos: number;
  neg: number;
}

export interface NewsByDay {
  date: string;
  count: number;
  pos: number;
  neg: number;
}

export interface NewsByHour {
  datetime: string; // UTC ISO truncated to hour
  count: number;
  pos: number;
  neg: number;
}

export interface NewsCacheFile {
  ticker: string;
  query: string;
  lang: string;
  geo: string;
  fetchedAt: string;
  items: NewsItemCache[];
  byDay: NewsByDay[];
  byHour?: NewsByHour[]; // Phase 2 이후 추가, 기존 캐시엔 없을 수 있음
}

export async function readNewsCache(
  ticker: string,
): Promise<NewsCacheFile | null> {
  return readJson<NewsCacheFile>(
    `${safeName(ticker)}_news.json`,
    (p) => Array.isArray(p.items) && Array.isArray(p.byDay),
  );
}
