// 서버 전용 캐시 reader.
// Python 수집기가 data/cache/{ticker}_stock.json 에 적재한 결과를 읽는다.
// 이 모듈은 fs를 사용하므로 클라이언트 컴포넌트에서 import 하지 말 것.

import fs from "node:fs/promises";
import path from "node:path";

export interface StockPoint {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface StockCacheFile {
  ticker: string;
  fetchedAt: string;
  period: string;
  interval: string;
  points: StockPoint[];
}

function safeName(ticker: string): string {
  return Array.from(ticker)
    .map((c) => (/[a-zA-Z0-9._-]/.test(c) ? c : "_"))
    .join("");
}

function cacheDir(): string {
  return process.env.CACHE_DIR ?? path.join(process.cwd(), "data", "cache");
}

export async function readStockCache(
  ticker: string,
): Promise<StockCacheFile | null> {
  const file = path.join(cacheDir(), `${safeName(ticker)}_stock.json`);
  try {
    const buf = await fs.readFile(file, "utf8");
    const parsed = JSON.parse(buf) as StockCacheFile;
    if (!Array.isArray(parsed.points)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export interface TrendsPoint {
  date: string;
  trend: number;
  sma7?: number;
  wow?: number | null;
}

export interface TrendsCacheFile {
  ticker: string;
  geo: string;
  timeframe: string;
  keywords: string[];
  fetchedAt: string;
  points: TrendsPoint[];
}

export async function readTrendsCache(
  ticker: string,
): Promise<TrendsCacheFile | null> {
  const file = path.join(cacheDir(), `${safeName(ticker)}_trends.json`);
  try {
    const buf = await fs.readFile(file, "utf8");
    const parsed = JSON.parse(buf) as TrendsCacheFile;
    if (!Array.isArray(parsed.points)) return null;
    return parsed;
  } catch {
    return null;
  }
}
