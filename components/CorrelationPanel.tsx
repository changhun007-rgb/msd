"use client";

// 리드/래그 상관 분석 패널.
// 시그널의 선후 "경향"을 관찰하기 위한 도구이며, 통계적 인과 추론이나 가격
// 예측을 의도하지 않는다. 색상은 부호(+/-)를 구분하기 위한 최소 톤만 사용.

import {
  buildCorrelations,
  LAGS,
  type LagPoint,
  type PairResult,
} from "@/lib/correlation";
import type { IntegratedSeries } from "@/types";

interface Props {
  series: IntegratedSeries;
}

function fmtLag(L: number): string {
  if (L === 0) return "0";
  return L > 0 ? `+${L}` : `${L}`;
}

function fmtR(r: number | null | undefined): string {
  if (r == null) return "—";
  return (r >= 0 ? "+" : "") + r.toFixed(2);
}

function leadHint(p: PairResult, L: number): string {
  if (L > 0) return `${p.xLabel}이 ${p.yLabel}을 ${L}일 선행`;
  if (L < 0) return `${p.yLabel}이 ${p.xLabel}을 ${-L}일 선행`;
  return "동일일 반응";
}

function cellTone(r: number | null): string {
  if (r == null) return "bg-gray-50 text-gray-300";
  const a = Math.abs(r);
  if (r >= 0) {
    if (a < 0.2) return "bg-emerald-50 text-emerald-700";
    if (a < 0.5) return "bg-emerald-200 text-emerald-900";
    return "bg-emerald-400 text-white";
  }
  if (a < 0.2) return "bg-rose-50 text-rose-700";
  if (a < 0.5) return "bg-rose-200 text-rose-900";
  return "bg-rose-400 text-white";
}

function barColor(r: number | null): string {
  if (r == null) return "bg-gray-200";
  return r >= 0 ? "bg-emerald-400" : "bg-rose-400";
}

function Heatmap({ pairs }: { pairs: PairResult[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-xs">
        <thead>
          <tr>
            <th className="px-2 py-1 text-left font-normal text-gray-400">
              lag (일)
            </th>
            {LAGS.map((L) => (
              <th
                key={L}
                className="px-0 py-1 text-center font-normal text-gray-400"
              >
                {fmtLag(L)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {pairs.map((p) => (
            <tr key={p.key}>
              <td className="whitespace-nowrap px-2 py-1 text-gray-700">
                {p.label}
              </td>
              {p.lags.map((lp) => (
                <td key={lp.lag} className="p-0.5">
                  <div
                    className={`mx-auto flex h-6 w-7 items-center justify-center rounded-sm text-[10px] font-medium ${
                      p.available ? cellTone(lp.r) : "bg-gray-50 text-gray-300"
                    }`}
                    title={
                      p.available
                        ? `lag ${fmtLag(lp.lag)}: r=${fmtR(lp.r)} (n=${lp.n})`
                        : p.reason
                    }
                  >
                    {p.available && lp.r != null && Math.abs(lp.r) >= 0.2
                      ? lp.r.toFixed(1).replace("0.", ".").replace("-.", "-.")
                      : ""}
                  </div>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Bar({ point }: { point: LagPoint }) {
  const H = 96;
  const half = H / 2;
  const h = point.r == null ? 0 : Math.min(1, Math.abs(point.r)) * half;
  const positive = point.r != null && point.r >= 0;
  return (
    <div
      className="relative mx-px h-full"
      title={`lag ${fmtLag(point.lag)}: r=${fmtR(point.r)} (n=${point.n})`}
    >
      <div
        className="absolute left-0 right-0 border-t border-gray-200"
        style={{ top: half }}
      />
      {point.r != null && (
        <div
          className={`absolute left-0 right-0 ${barColor(point.r)} ${
            positive ? "rounded-t-sm" : "rounded-b-sm"
          }`}
          style={
            positive
              ? { top: half - h, height: h }
              : { top: half, height: h }
          }
        />
      )}
    </div>
  );
}

function BarChart({ pair }: { pair: PairResult }) {
  if (!pair.available) {
    return (
      <div className="rounded border border-dashed border-gray-200 bg-gray-50 px-3 py-6 text-center text-xs text-gray-500">
        {pair.reason ?? "데이터 부족"}
      </div>
    );
  }
  return (
    <div>
      <div
        className="grid h-24"
        style={{ gridTemplateColumns: `repeat(${LAGS.length}, minmax(0, 1fr))` }}
      >
        {pair.lags.map((lp) => (
          <Bar key={lp.lag} point={lp} />
        ))}
      </div>
      <div
        className="mt-1 grid text-[10px] text-gray-400"
        style={{ gridTemplateColumns: `repeat(${LAGS.length}, minmax(0, 1fr))` }}
      >
        {pair.lags.map((lp) => (
          <span
            key={lp.lag}
            className={
              "text-center " + (lp.lag === 0 ? "font-medium text-gray-500" : "")
            }
          >
            {fmtLag(lp.lag)}
          </span>
        ))}
      </div>
    </div>
  );
}

function PairCard({ pair }: { pair: PairResult }) {
  return (
    <div className="rounded-md border border-gray-100 bg-white p-3">
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <h4 className="text-sm font-medium text-gray-800">{pair.label}</h4>
        {pair.available && pair.peak && (
          <span className="text-xs text-gray-500">
            peak{" "}
            <span className="font-medium text-gray-700">
              {fmtLag(pair.peak.lag)}
            </span>{" "}
            <span
              className={
                pair.peak.r != null && pair.peak.r >= 0
                  ? "text-emerald-700"
                  : "text-rose-700"
              }
            >
              r={fmtR(pair.peak.r)}
            </span>
            <span className="ml-1 text-gray-400">n={pair.peak.n}</span>
          </span>
        )}
      </div>
      <p className="mb-2 text-xs text-gray-500">{pair.hint}</p>
      <BarChart pair={pair} />
    </div>
  );
}

function SummaryTable({ pairs }: { pairs: PairResult[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-xs">
        <thead>
          <tr className="text-left text-gray-400">
            <th className="px-2 py-1 font-normal">관계</th>
            <th className="px-2 py-1 font-normal">peak lag</th>
            <th className="px-2 py-1 font-normal">r</th>
            <th className="px-2 py-1 font-normal">n</th>
            <th className="px-2 py-1 font-normal">해석</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {pairs.map((p) => {
            const peak = p.peak;
            return (
              <tr key={p.key}>
                <td className="px-2 py-1.5 text-gray-800">{p.label}</td>
                <td className="px-2 py-1.5 text-gray-700">
                  {p.available && peak ? `${fmtLag(peak.lag)}일` : "—"}
                </td>
                <td
                  className={
                    "px-2 py-1.5 font-medium " +
                    (peak?.r == null
                      ? "text-gray-400"
                      : peak.r >= 0
                        ? "text-emerald-700"
                        : "text-rose-700")
                  }
                >
                  {fmtR(peak?.r ?? null)}
                </td>
                <td className="px-2 py-1.5 text-gray-500">{peak?.n ?? "—"}</td>
                <td className="px-2 py-1.5 text-gray-600">
                  {p.available && peak ? leadHint(p, peak.lag) : (p.reason ?? "")}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default function CorrelationPanel({ series }: Props) {
  const pairs = buildCorrelations(series.points);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h3 className="text-sm font-semibold text-gray-800">
          리드/래그 상관 분석
        </h3>
        <p className="mt-0.5 text-xs text-gray-500">
          lag = +L: 좌측 시그널이 우측 시그널을 L일 선행했을 때의 상관계수.
          예측 도구가 아니라, 어떤 시그널이 먼저 움직이는 경향이 있는지 관찰하기 위한 표시입니다.
        </p>
      </div>

      <div className="rounded-md border border-gray-100 bg-white p-3">
        <Heatmap pairs={pairs} />
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        {pairs.map((p) => (
          <PairCard key={p.key} pair={p} />
        ))}
      </div>

      <div className="rounded-md border border-gray-100 bg-white p-3">
        <SummaryTable pairs={pairs} />
      </div>
    </div>
  );
}
