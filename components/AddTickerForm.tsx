"use client";

import { useState } from "react";
import type { Region, TickerMeta } from "@/types";

interface Props {
  onAdded: (meta: TickerMeta) => void;
}

const REGIONS: Region[] = ["US", "KR", "JP"];

export default function AddTickerForm({ onAdded }: Props) {
  const [open, setOpen] = useState(false);
  const [ticker, setTicker] = useState("");
  const [region, setRegion] = useState<Region>("US");
  const [display, setDisplay] = useState("");
  const [keywords, setKeywords] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setTicker("");
    setDisplay("");
    setKeywords("");
    setError(null);
  };

  const submit = async () => {
    setError(null);
    setSubmitting(true);
    try {
      const trendsKeywords = keywords
        .split(",")
        .map((k) => k.trim())
        .filter(Boolean);
      const res = await fetch("/api/tickers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ticker: ticker.trim().toUpperCase(),
          region,
          display: display.trim() || undefined,
          trendsKeywords,
        }),
      });
      const json = (await res.json()) as
        | { meta: TickerMeta; status: string }
        | { error: string };
      if (!res.ok) {
        const msg = "error" in json ? json.error : `HTTP ${res.status}`;
        throw new Error(msg);
      }
      if ("meta" in json) {
        onAdded(json.meta);
        reset();
        setOpen(false);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "추가 실패");
    } finally {
      setSubmitting(false);
    }
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-md border border-dashed border-gray-300 px-2 py-1 text-xs text-gray-600 hover:border-gray-500 hover:bg-gray-50"
      >
        + 종목 추가
      </button>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-md border border-gray-300 bg-gray-50 px-2 py-1.5">
      <input
        type="text"
        placeholder="티커 (예: MSFT, 035420.KS)"
        value={ticker}
        onChange={(e) => setTicker(e.target.value)}
        disabled={submitting}
        className="w-44 rounded-md border border-gray-200 bg-white px-2 py-1 text-xs focus:border-gray-400 focus:outline-none"
      />
      <select
        value={region}
        onChange={(e) => setRegion(e.target.value as Region)}
        disabled={submitting}
        className="rounded-md border border-gray-200 bg-white px-2 py-1 text-xs"
      >
        {REGIONS.map((r) => (
          <option key={r} value={r}>
            {r}
          </option>
        ))}
      </select>
      <input
        type="text"
        placeholder="표시명 (선택)"
        value={display}
        onChange={(e) => setDisplay(e.target.value)}
        disabled={submitting}
        className="w-32 rounded-md border border-gray-200 bg-white px-2 py-1 text-xs focus:border-gray-400 focus:outline-none"
      />
      <input
        type="text"
        placeholder="트렌드 키워드, 쉼표구분 (선택)"
        value={keywords}
        onChange={(e) => setKeywords(e.target.value)}
        disabled={submitting}
        className="w-56 rounded-md border border-gray-200 bg-white px-2 py-1 text-xs focus:border-gray-400 focus:outline-none"
      />
      <button
        type="button"
        onClick={submit}
        disabled={submitting || !ticker.trim()}
        className="rounded-md bg-gray-900 px-2 py-1 text-xs text-white hover:bg-gray-800 disabled:opacity-50"
      >
        {submitting ? "추가 중…" : "추가"}
      </button>
      <button
        type="button"
        onClick={() => {
          reset();
          setOpen(false);
        }}
        disabled={submitting}
        className="rounded-md border border-gray-200 bg-white px-2 py-1 text-xs text-gray-600 hover:bg-gray-50 disabled:opacity-50"
      >
        취소
      </button>
      {error && (
        <span className="text-xs text-red-600">{error}</span>
      )}
    </div>
  );
}
