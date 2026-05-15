// Server-only ticker registry.
// data/keywords/tickers.json 을 매 요청마다 읽는다.
//   - 로컬: 디스크
//   - 배포(GitHub 모드): GitHub raw
// 쓰기(addTicker)는 로컬 디스크 전용 — 배포 환경에서는 Phase 3 의
// GitHub API 커밋 경로를 쓴다.

import fs from "node:fs/promises";
import path from "node:path";
import { isGithubMode, readKeywordsText } from "@/lib/dataSource";
import type { Region, TickerMeta } from "@/types";

function tickersFile(): string {
  return path.join(process.cwd(), "data", "keywords", "tickers.json");
}

export async function readTickers(): Promise<Record<string, TickerMeta>> {
  const text = await readKeywordsText();
  if (text == null) return {};
  return JSON.parse(text) as Record<string, TickerMeta>;
}

export async function listTickersServer(): Promise<TickerMeta[]> {
  const map = await readTickers();
  return Object.values(map);
}

export async function getTickerMetaServer(
  symbol: string,
): Promise<TickerMeta | null> {
  const map = await readTickers();
  return map[symbol] ?? null;
}

// yfinance 접미사 화이트리스트 — 단순 검증용.
const REGION_SUFFIX: Record<Region, RegExp> = {
  US: /^[A-Z][A-Z0-9.-]{0,9}$/, // TSLA, BRK.B, etc
  KR: /^\d{6}\.(KS|KQ)$/, // 005930.KS, 247540.KQ
  JP: /^\d{4}\.T$/, // 7203.T (Toyota)
};

export function validateTicker(
  ticker: string,
  region: Region,
): { ok: true } | { ok: false; error: string } {
  if (!ticker) return { ok: false, error: "ticker required" };
  const pat = REGION_SUFFIX[region];
  if (!pat) return { ok: false, error: `unsupported region: ${region}` };
  if (!pat.test(ticker)) {
    return {
      ok: false,
      error:
        region === "KR"
          ? "한국 종목은 6자리 + .KS(코스피) 또는 .KQ(코스닥) 형식이어야 합니다. 예: 005930.KS"
          : region === "JP"
            ? "일본 종목은 4자리 + .T 형식이어야 합니다. 예: 7203.T"
            : "미국 종목은 대문자 영숫자(.포함)여야 합니다. 예: AAPL, BRK.B",
    };
  }
  return { ok: true };
}

// 로컬 디스크에 종목 추가. 배포(GitHub 모드)에서는 호출하지 않는다 —
// Phase 3 에서 GitHub Contents API 커밋 경로로 대체.
export async function addTicker(meta: TickerMeta): Promise<void> {
  if (isGithubMode()) {
    throw new Error(
      "addTicker: GitHub 모드에서는 디스크 쓰기 불가 — GitHub API 경로 사용",
    );
  }
  const map = await readTickers();
  if (map[meta.ticker]) {
    throw new Error(`ticker already exists: ${meta.ticker}`);
  }
  map[meta.ticker] = meta;
  const json = JSON.stringify(map, null, 2) + "\n";
  await fs.writeFile(tickersFile(), json, "utf8");
}
