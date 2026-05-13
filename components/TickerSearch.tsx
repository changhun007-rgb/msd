"use client";

import type { Region, TickerMeta } from "@/types";

interface Props {
  tickers: TickerMeta[];
  selected: string;
  region: Region;
  onSelect: (symbol: string) => void;
  onRegion: (region: Region) => void;
}

const REGIONS: Region[] = ["US", "KR", "JP"];

export default function TickerSearch({
  tickers,
  selected,
  region,
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
              {t.display} ({t.ticker})
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
