// 관심 종목 목록 / 추가 API.
//   GET  /api/tickers           → tickers.json 전체 + 각 종목의 캐시 적재 상태
//   POST /api/tickers           → 새 종목 추가 + Python 수집기 백그라운드 실행

import { NextResponse } from "next/server";
import {
  addTicker,
  listTickersServer,
  validateTicker,
} from "@/lib/tickers";
import { cacheFileExists, isGithubMode } from "@/lib/dataSource";
import { addTickerViaGithub, dispatchFetch } from "@/lib/github";
import type { Region, TickerMeta } from "@/types";
// lib/pythonRunner 는 node:child_process 에 의존 — Cloudflare Workers 에
// 없는 모듈이라 정적 import 하지 않고, 로컬 모드 분기에서만 동적 import 한다.

export const dynamic = "force-dynamic";

function safeName(ticker: string): string {
  return Array.from(ticker)
    .map((c) => (/[a-zA-Z0-9._-]/.test(c) ? c : "_"))
    .join("");
}

export async function GET() {
  const tickers = await listTickersServer();

  const entries = await Promise.all(
    tickers.map(async (t) => {
      const base = safeName(t.ticker);
      const [stock, trends, news] = await Promise.all([
        cacheFileExists(`${base}_stock.json`),
        cacheFileExists(`${base}_trends.json`),
        cacheFileExists(`${base}_news.json`),
      ]);
      return [t.ticker, { stock, trends, news }] as const;
    }),
  );
  const status = Object.fromEntries(entries);

  return NextResponse.json(
    { tickers, status },
    { headers: { "Cache-Control": "no-store" } },
  );
}

interface AddTickerBody {
  ticker?: unknown;
  region?: unknown;
  display?: unknown;
  trendsKeywords?: unknown;
}

export async function POST(req: Request) {
  let body: AddTickerBody;
  try {
    body = (await req.json()) as AddTickerBody;
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  const ticker = typeof body.ticker === "string" ? body.ticker.trim() : "";
  const regionRaw =
    typeof body.region === "string" ? body.region.toUpperCase() : "";
  const region = regionRaw as Region;
  const display =
    typeof body.display === "string" && body.display.trim()
      ? body.display.trim()
      : ticker;
  const trendsKeywords = Array.isArray(body.trendsKeywords)
    ? body.trendsKeywords
        .filter((k): k is string => typeof k === "string" && k.trim().length > 0)
        .map((k) => k.trim())
    : [];

  const v = validateTicker(ticker, region);
  if (!v.ok) {
    return NextResponse.json({ error: v.error }, { status: 400 });
  }

  const meta: TickerMeta = {
    ticker,
    display,
    region,
    trendsKeywords: trendsKeywords.length > 0 ? trendsKeywords : [ticker],
  };

  if (isGithubMode()) {
    // 배포 환경: tickers.json 을 GitHub 에 커밋 + 수집 워크플로 트리거.
    try {
      await addTickerViaGithub(meta);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "add failed";
      const status = msg.includes("already exists") ? 409 : 500;
      return NextResponse.json({ error: msg }, { status });
    }
    try {
      await dispatchFetch(ticker);
    } catch (e) {
      // 종목은 추가됐으나 수집 트리거만 실패 — 다음 정기 cron 이 메움.
      console.error("[POST /api/tickers] dispatch 실패:", e);
    }
  } else {
    // 로컬: 디스크에 쓰고 Python 수집기를 즉시 spawn.
    try {
      await addTicker(meta);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "add failed";
      return NextResponse.json({ error: msg }, { status: 409 });
    }
    const { runFetchAllBackground } = await import("@/lib/pythonRunner");
    runFetchAllBackground(ticker);
  }

  return NextResponse.json(
    { meta, status: "queued" },
    { status: 202, headers: { "Cache-Control": "no-store" } },
  );
}
