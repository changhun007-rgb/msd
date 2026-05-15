// 특정 종목의 캐시 적재 상태. 추가 직후 polling 용도.
//   GET /api/tickers/:ticker/status
//   → { stock: boolean, trends: boolean, news: boolean }
// 로컬/GitHub 모드 모두 lib/dataSource 의 존재 체크를 사용.

import { NextResponse } from "next/server";
import { cacheFileExists } from "@/lib/dataSource";

export const dynamic = "force-dynamic";

function safeName(ticker: string): string {
  return Array.from(ticker)
    .map((c) => (/[a-zA-Z0-9._-]/.test(c) ? c : "_"))
    .join("");
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ ticker: string }> },
) {
  const { ticker } = await params;
  const base = safeName(ticker);

  const [stock, trends, news] = await Promise.all([
    cacheFileExists(`${base}_stock.json`),
    cacheFileExists(`${base}_trends.json`),
    cacheFileExists(`${base}_news.json`),
  ]);

  return NextResponse.json(
    { ticker, stock, trends, news },
    { headers: { "Cache-Control": "no-store" } },
  );
}
