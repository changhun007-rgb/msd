"use client";

import type { Region, TickerMeta } from "@/types";

export interface TickerCacheStatus {
  stock: boolean;
  trends: boolean;
  news: boolean;
}

interface Props {
  tickers: TickerMeta[];
  selected: string;
  region: Region;
  status?: Record<string, TickerCacheStatus>;
  onSelect: (symbol: string) => void;
  onRegion: (region: Region) => void;
}

const REGIONS: Region[] = ["US", "KR", "JP"];

// stock 캐시가 없으면 가격 자체가 mock 폴백 — 가장 두드러진 신호.
function statusLabel(s: TickerCacheStatus | undefined): string {
  if (!s) return "";
  if (!s.stock) return " ⚠ 미수집";
  const missing: string[] = [];
  if (!s.trends) missing.push("검색");
  if (!s.news) missing.push("뉴스");
  return missing.length > 0 ? ` ⚠ ${missing.join("/")} mock` : "";
}

export default function TickerSearch({
  tickers,
  selected,
  region,
  status,
  onSelect,
  onRegion,
}: Props) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <label className="flex items-center gap-2 text-sm text-gray-600">
        <span className="font-medium text-gray-700">종목</span>
        <select
          value={selected}
          onChange={(e) => onSelect(e.target.value)}
          className="rounded-md border border-gray-200 bg-white px-2 py-1 text-sm focus:border-gray-400 focus:outline-none"
        >
          {tickers.map((t) => (
            <option key={t.ticker} value={t.ticker}>
              {t.display} ({t.ticker}){statusLabel(status?.[t.ticker])}
            </option>
          ))}
        </select>
      </label>

      <div className="flex items-center gap-1">
        <span className="text-sm font-medium text-gray-700">지역</span>
        {REGIONS.map((r) => (
          <button
            key={r}
            type="button"
            onClick={() => onRegion(r)}
            className={
              "rounded-md border px-2 py-1 text-xs transition " +
              (r === region
                ? "border-gray-800 bg-gray-900 text-white"
                : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50")
            }
          >
            {r}
          </button>
        ))}
      </div>
    </div>
  );
}
