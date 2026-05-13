"use client";

// 최근 N일 긍정/부정 합계를 막대 바로 압축 표시
import type { IntegratedSeries } from "@/types";

interface Props {
  series: IntegratedSeries;
  days?: number;
}

export default function SentimentChart({ series, days = 14 }: Props) {
  const tail = series.points.slice(-days);
  const pos = tail.reduce((a, p) => a + p.posScore, 0);
  const neg = tail.reduce((a, p) => a + p.negScore, 0);
  const total = Math.max(1, pos + neg);
  const posPct = (pos / total) * 100;

  return (
    <div>
      <div className="mb-2 flex items-center justify-between text-sm">
        <h3 className="font-semibold text-gray-800">감성 분석 ({days}일)</h3>
        <span className="text-xs text-gray-500">
          긍정 {pos} · 부정 {neg}
        </span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-gray-100">
        <div
          className="h-full bg-emerald-500"
          style={{ width: `${posPct}%` }}
        />
      </div>
      <div className="mt-1 flex justify-between text-xs text-gray-500">
        <span>긍정 {posPct.toFixed(0)}%</span>
        <span>부정 {(100 - posPct).toFixed(0)}%</span>
      </div>
    </div>
  );
}
