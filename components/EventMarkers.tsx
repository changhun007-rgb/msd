"use client";

// 이벤트 목록 패널.
// lib/events.ts와 동일한 탐지 로직을 공유 — 차트 마커와 일관됨.
// 항목 클릭 시 인라인 디테일(해당 날짜의 시그널 + 매칭 뉴스 헤드라인)을 펼치고,
// 동시에 onSelect 콜백으로 외부(차트)에게 포커스 요청.

import { useMemo, useState } from "react";
import { detectEvents, type EventKind, type MarketEvent } from "@/lib/events";
import type { IntegratedPoint, IntegratedSeries, NewsItem } from "@/types";

interface Props {
  series: IntegratedSeries;
  onSelect?: (date: string | null) => void;
}

const KIND_STYLE: Record<EventKind, string> = {
  "search-surge": "bg-violet-50 text-violet-700 border-violet-200",
  "news-burst": "bg-slate-50 text-slate-700 border-slate-200",
  "volume-surge": "bg-blue-50 text-blue-700 border-blue-200",
  "price-up": "bg-emerald-50 text-emerald-700 border-emerald-200",
  "price-down": "bg-red-50 text-red-700 border-red-200",
};

function fmtVolume(v: number): string {
  return `${(v / 1_000_000).toFixed(1)}M`;
}

function newsForDate(items: NewsItem[] | undefined, date: string): NewsItem[] {
  if (!items) return [];
  return items.filter((it) => it.date === date);
}

function PointDetail({
  point,
  news,
}: {
  point: IntegratedPoint;
  news: NewsItem[];
}) {
  return (
    <div className="mt-1 rounded-md border border-gray-100 bg-gray-50 px-2.5 py-2 text-xs text-gray-700">
      <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 sm:grid-cols-4">
        <Cell label="종가" value={point.close.toLocaleString()} />
        <Cell label="거래량" value={fmtVolume(point.volume)} />
        <Cell label="검색" value={String(point.trend)} />
        <Cell label="뉴스" value={`${point.newsCount}건`} />
        <Cell label="긍정" value={String(point.posScore)} tone="emerald" />
        <Cell label="부정" value={String(point.negScore)} tone="rose" />
      </div>
      {news.length > 0 && (
        <ul className="mt-2 space-y-1 border-t border-gray-100 pt-1.5">
          {news.slice(0, 4).map((n, i) => (
            <li key={(n.link || n.title) + i} className="flex gap-1.5">
              <span
                className={
                  n.pos > n.neg
                    ? "text-emerald-700"
                    : n.neg > n.pos
                      ? "text-rose-700"
                      : "text-gray-400"
                }
              >
                {n.pos > n.neg ? "+" : n.neg > n.pos ? "−" : "·"}
              </span>
              <a
                href={n.link}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 truncate text-gray-700 hover:text-blue-700 hover:underline"
                title={n.title}
              >
                {n.title}
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Cell({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "emerald" | "rose";
}) {
  const toneClass =
    tone === "emerald"
      ? "text-emerald-700"
      : tone === "rose"
        ? "text-rose-700"
        : "text-gray-800";
  return (
    <div className="flex items-baseline gap-1">
      <span className="text-[10px] uppercase tracking-wide text-gray-400">
        {label}
      </span>
      <span className={`font-medium ${toneClass}`}>{value}</span>
    </div>
  );
}

export default function EventMarkers({ series, onSelect }: Props) {
  const [openDate, setOpenDate] = useState<string | null>(null);

  const events = useMemo<MarketEvent[]>(() => {
    return detectEvents(series.points).sort((a, b) =>
      b.date.localeCompare(a.date),
    );
  }, [series]);

  const pointByDate = useMemo(() => {
    const m = new Map<string, IntegratedPoint>();
    for (const p of series.points) m.set(p.date, p);
    return m;
  }, [series.points]);

  const toggle = (date: string) => {
    const next = openDate === date ? null : date;
    setOpenDate(next);
    onSelect?.(next);
  };

  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between">
        <h3 className="text-sm font-semibold text-gray-800">주요 이벤트</h3>
        <span className="text-[11px] text-gray-400">
          z-score &gt; 2σ · 가격 ±5%
        </span>
      </div>

      {events.length === 0 ? (
        <p className="text-sm text-gray-500">
          최근 구간에 스파이크 이벤트가 없습니다.
        </p>
      ) : (
        <ul className="space-y-1">
          {events.slice(0, 30).map((e, i) => {
            const open = openDate === e.date;
            const point = pointByDate.get(e.date);
            const news = newsForDate(series.recentNews, e.date);
            return (
              <li key={i}>
                <button
                  type="button"
                  onClick={() => toggle(e.date)}
                  className={
                    "flex w-full items-center gap-2 rounded border px-2 py-1.5 text-left text-xs transition hover:brightness-95 " +
                    KIND_STYLE[e.kind]
                  }
                >
                  <span className="min-w-[68px] font-medium">{e.label}</span>
                  <span className="font-mono text-gray-500">{e.date}</span>
                  <span className="ml-auto text-gray-700">{e.detail}</span>
                  <span className="text-gray-400">{open ? "▾" : "▸"}</span>
                </button>
                {open && point && (
                  <PointDetail point={point} news={news} />
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
