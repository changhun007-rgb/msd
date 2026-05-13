"use client";

// Step 1: 스파이크 기반 이벤트 목록.
// Step 6에서 IntegratedChart에 실제 마커를 그리도록 확장 가능.

import { useMemo } from "react";
import type { IntegratedSeries } from "@/types";
import { dailyReturn, spikes } from "@/lib/indicators";

interface Props {
  series: IntegratedSeries;
}

interface Evt {
  date: string;
  type: string;
  detail: string;
}

const KIND_STYLE: Record<string, string> = {
  "검색량 급증": "bg-violet-50 text-violet-700 border-violet-200",
  "뉴스량 급증": "bg-slate-50 text-slate-700 border-slate-200",
  "거래량 급증": "bg-blue-50 text-blue-700 border-blue-200",
  "급등": "bg-emerald-50 text-emerald-700 border-emerald-200",
  "급락": "bg-red-50 text-red-700 border-red-200",
};

export default function EventMarkers({ series }: Props) {
  const events = useMemo<Evt[]>(() => {
    const pts = series.points;
    const trendSpikes = spikes(pts.map((p) => p.trend));
    const newsSpikes = spikes(pts.map((p) => p.newsCount));
    const volSpikes = spikes(pts.map((p) => p.volume));
    const rets = dailyReturn(pts.map((p) => p.close));
    const out: Evt[] = [];
    pts.forEach((p, i) => {
      if (trendSpikes[i]) out.push({ date: p.date, type: "검색량 급증", detail: `Trend ${p.trend}` });
      if (newsSpikes[i]) out.push({ date: p.date, type: "뉴스량 급증", detail: `${p.newsCount}건` });
      if (volSpikes[i]) out.push({ date: p.date, type: "거래량 급증", detail: `${(p.volume / 1_000_000).toFixed(1)}M` });
      const r = rets[i];
      if (r != null && r > 5) out.push({ date: p.date, type: "급등", detail: `+${r.toFixed(1)}%` });
      if (r != null && r < -5) out.push({ date: p.date, type: "급락", detail: `${r.toFixed(1)}%` });
    });
    return out.slice(-20).reverse();
  }, [series]);

  return (
    <div>
      <h3 className="mb-2 text-sm font-semibold text-gray-800">주요 이벤트</h3>
      {events.length === 0 ? (
        <p className="text-sm text-gray-500">최근 구간에 스파이크 이벤트가 없습니다.</p>
      ) : (
        <ul className="grid grid-cols-1 gap-1.5 md:grid-cols-2">
          {events.map((e, i) => (
            <li
              key={i}
              className={
                "flex items-center justify-between rounded border px-2 py-1.5 text-xs " +
                (KIND_STYLE[e.type] ?? "bg-gray-50 text-gray-700 border-gray-200")
              }
            >
              <span className="font-medium">{e.type}</span>
              <span className="text-gray-500">{e.date}</span>
              <span>{e.detail}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
