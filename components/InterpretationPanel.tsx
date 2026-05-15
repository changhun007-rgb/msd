"use client";

// 관심 흐름 해석 패널
// "예측"이 아니라 "비대칭 관찰"을 보여준다.
// 명세 예시:
// - 검색량은 급증했는데 가격 반응 약함
// - 가격은 상승했지만 검색량이 계속 증가
// - 부정 뉴스인데 가격이 안 떨어짐
// - 거래량은 증가했는데 뉴스량은 적음

import { useMemo } from "react";
import type { IntegratedSeries } from "@/types";
import { pctChange, sma, spikes } from "@/lib/indicators";

interface Props {
  series: IntegratedSeries;
}

interface Observation {
  label: string;
  detail: string;
}

export default function InterpretationPanel({ series }: Props) {
  const observations = useMemo<Observation[]>(() => {
    const pts = series.points;
    if (pts.length < 14) return [];
    const closes = pts.map((p) => p.close);
    const volumes = pts.map((p) => p.volume);
    // 트렌드 캐시 범위 밖이면 null — 지표 계산에서는 0 으로 대체.
    // 해석은 최근 ~7일 위주라 이 구간은 캐시 안에 있어 정확도 영향 미미.
    const trends = pts.map((p) => p.trend ?? 0);
    const news = pts.map((p) => p.newsCount);

    const closeMA = sma(closes, 7).at(-1);
    const closePrev = sma(closes, 7).at(-8);
    const trendChange = pctChange(trends, 7).at(-1) ?? 0;
    const newsChange = pctChange(news, 7).at(-1) ?? 0;
    const priceChange =
      closeMA != null && closePrev != null && closePrev > 0
        ? ((closeMA - closePrev) / closePrev) * 100
        : 0;

    const trendSpike = spikes(trends).at(-1) ?? false;
    const newsSpike = spikes(news).at(-1) ?? false;
    const volSpike = spikes(volumes).at(-1) ?? false;

    const recentPos = pts.slice(-7).reduce((a, p) => a + p.posScore, 0);
    const recentNeg = pts.slice(-7).reduce((a, p) => a + p.negScore, 0);

    const out: Observation[] = [];

    if (trendSpike && Math.abs(priceChange) < 1) {
      out.push({
        label: "검색량 급증 vs 가격 반응 약함",
        detail: `최근 검색량 z-score 급증, 7일 가격 변화 ${priceChange.toFixed(1)}%. 관심은 모이지만 거래로 즉시 전환되지 않은 상태.`,
      });
    }
    if (priceChange > 2 && trendChange > 0) {
      out.push({
        label: "가격 상승 + 검색량 지속 증가",
        detail: `가격 ${priceChange.toFixed(1)}% / 검색량 ${trendChange.toFixed(1)}%. 관심 확산이 지속 중인 구간.`,
      });
    }
    if (recentNeg > recentPos && priceChange >= 0) {
      out.push({
        label: "부정 뉴스 우세인데 가격은 버팀",
        detail: `최근 7일 긍정 ${recentPos} / 부정 ${recentNeg}. 부정 감성에도 가격이 하락 전환하지 않은 비대칭.`,
      });
    }
    if (volSpike && !newsSpike) {
      out.push({
        label: "거래량 급증 vs 뉴스량 평이",
        detail: `거래량은 z-score 급증, 뉴스 노출은 평이. 비공개 이벤트/소문/SNS 흐름 가능성.`,
      });
    }
    if (trendChange > 20 && newsChange < 5) {
      out.push({
        label: "검색량 선행 (뉴스 미반영)",
        detail: `검색량 ${trendChange.toFixed(0)}% 증가, 뉴스량 ${newsChange.toFixed(0)}%. 대중의 관심이 미디어보다 앞서있을 수 있음.`,
      });
    }

    return out;
  }, [series]);

  return (
    <div>
      <h3 className="mb-2 text-sm font-semibold text-gray-800">관심 흐름 해석</h3>
      {observations.length === 0 ? (
        <p className="text-sm text-gray-500">
          최근 구간에서 두드러진 비대칭 패턴이 감지되지 않았습니다.
        </p>
      ) : (
        <ul className="space-y-2">
          {observations.map((o) => (
            <li
              key={o.label}
              className="rounded border border-amber-100 bg-amber-50/60 px-3 py-2"
            >
              <div className="text-sm font-medium text-gray-800">{o.label}</div>
              <div className="mt-0.5 text-xs text-gray-600">{o.detail}</div>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-3 text-[11px] leading-relaxed text-gray-400">
        ※ 매수/매도 추천이 아닙니다. 관찰된 관심·거래·뉴스 흐름의 비대칭만 표시합니다.
      </p>
    </div>
  );
}
