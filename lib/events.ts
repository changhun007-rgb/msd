// 차트 마커와 패널이 공유하는 이벤트 탐지.
// 스파이크는 z-score(이전 14일 기준) > 2σ — indicators.spikes 재사용.
// 가격 급변은 단순 일간 수익률 |%| 임계치 (기본 ±5%).
//
// "예측" 컨텍스트가 아니라 시점 어노테이션이므로 임계치는 보수적으로.

import type { IntegratedPoint } from "@/types";
import { dailyReturn, spikes } from "@/lib/indicators";

export type EventKind =
  | "search-surge"
  | "news-burst"
  | "volume-surge"
  | "price-up"
  | "price-down";

export interface MarketEvent {
  date: string;
  kind: EventKind;
  label: string;
  detail: string;
  magnitude: number; // 정렬 가능한 수치 (|%| 또는 절대값)
}

export const PRICE_SHOCK_PCT = 5;

const LABEL: Record<EventKind, string> = {
  "search-surge": "검색 급증",
  "news-burst": "뉴스 급증",
  "volume-surge": "거래량 급증",
  "price-up": "가격 급등",
  "price-down": "가격 급락",
};

export function eventLabel(kind: EventKind): string {
  return LABEL[kind];
}

export function detectEvents(points: IntegratedPoint[]): MarketEvent[] {
  // trend 가 null 인 날짜는 spike 탐지에서 제외해야 NaN 전염을 막을 수 있음.
  // null → 0 으로 치환한 시리즈로 spikes 계산하되, 결과는 null 인 인덱스에서 강제 false.
  const trendForSpikes = points.map((p) => p.trend ?? 0);
  const trendSp = spikes(trendForSpikes).map(
    (s, i) => s && points[i].trend != null,
  );
  const newsSp = spikes(points.map((p) => p.newsCount));
  const volSp = spikes(points.map((p) => p.volume));
  const rets = dailyReturn(points.map((p) => p.close));

  const out: MarketEvent[] = [];
  points.forEach((p, i) => {
    if (trendSp[i] && p.trend != null) {
      out.push({
        date: p.date,
        kind: "search-surge",
        label: LABEL["search-surge"],
        detail: `검색 ${p.trend}`,
        magnitude: p.trend,
      });
    }
    if (newsSp[i]) {
      out.push({
        date: p.date,
        kind: "news-burst",
        label: LABEL["news-burst"],
        detail: `${p.newsCount}건`,
        magnitude: p.newsCount,
      });
    }
    if (volSp[i]) {
      out.push({
        date: p.date,
        kind: "volume-surge",
        label: LABEL["volume-surge"],
        detail: `${(p.volume / 1_000_000).toFixed(1)}M`,
        magnitude: p.volume,
      });
    }
    const r = rets[i];
    if (r != null && r >= PRICE_SHOCK_PCT) {
      out.push({
        date: p.date,
        kind: "price-up",
        label: LABEL["price-up"],
        detail: `+${r.toFixed(1)}%`,
        magnitude: r,
      });
    }
    if (r != null && r <= -PRICE_SHOCK_PCT) {
      out.push({
        date: p.date,
        kind: "price-down",
        label: LABEL["price-down"],
        detail: `${r.toFixed(1)}%`,
        magnitude: r,
      });
    }
  });
  return out;
}
