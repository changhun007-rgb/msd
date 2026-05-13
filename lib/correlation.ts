// lead/lag 상관 분석.
//
// 규약: lag = L 에 대해 x[i]와 y[i+L]을 쌍으로.
//   L > 0  → x가 y를 L일 선행
//   L < 0  → y가 x를 |L|일 선행
//   L = 0  → 동일일
//
// 이 모듈은 통계적 인과를 주장하지 않는다.
// 어떤 시그널이 먼저 움직이는 "경향"이 있는지 관찰용 표시일 뿐.

import type { IntegratedPoint } from "@/types";

export interface LagPoint {
  lag: number;
  r: number | null;
  n: number; // 유효 페어 수
}

export interface PairResult {
  key: string;
  label: string;
  xLabel: string;
  yLabel: string;
  hint: string;
  lags: LagPoint[];
  peak: LagPoint | null;
  available: boolean;
  reason?: string;
}

const MIN_N = 14;

export const LAGS: number[] = Array.from({ length: 15 }, (_, i) => i - 7);

export function pearson(xs: number[], ys: number[]): number | null {
  const n = xs.length;
  if (n < 2 || ys.length !== n) return null;
  let sx = 0;
  let sy = 0;
  for (let i = 0; i < n; i++) {
    sx += xs[i];
    sy += ys[i];
  }
  const mx = sx / n;
  const my = sy / n;
  let num = 0;
  let dx2 = 0;
  let dy2 = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - mx;
    const dy = ys[i] - my;
    num += dx * dy;
    dx2 += dx * dx;
    dy2 += dy * dy;
  }
  if (dx2 === 0 || dy2 === 0) return null;
  return num / Math.sqrt(dx2 * dy2);
}

export function dailyReturns(closes: number[]): (number | null)[] {
  const out: (number | null)[] = [null];
  for (let i = 1; i < closes.length; i++) {
    const prev = closes[i - 1];
    if (!Number.isFinite(prev) || prev === 0) {
      out.push(null);
      continue;
    }
    out.push((closes[i] - prev) / prev);
  }
  return out;
}

export function leadLag(
  x: readonly (number | null | undefined)[],
  y: readonly (number | null | undefined)[],
  lags: readonly number[],
): LagPoint[] {
  const n = Math.min(x.length, y.length);
  return lags.map((L) => {
    const xs: number[] = [];
    const ys: number[] = [];
    for (let i = 0; i < n; i++) {
      const j = i + L;
      if (j < 0 || j >= n) continue;
      const xv = x[i];
      const yv = y[j];
      if (
        xv == null ||
        yv == null ||
        !Number.isFinite(xv) ||
        !Number.isFinite(yv)
      ) {
        continue;
      }
      xs.push(xv);
      ys.push(yv);
    }
    const r = xs.length >= MIN_N ? pearson(xs, ys) : null;
    return { lag: L, r, n: xs.length };
  });
}

function bestPeak(lags: LagPoint[]): LagPoint | null {
  let best: LagPoint | null = null;
  for (const lp of lags) {
    if (lp.r == null) continue;
    if (best === null || Math.abs(lp.r) > Math.abs(best.r as number)) {
      best = lp;
    }
  }
  return best;
}

export function buildCorrelations(points: IntegratedPoint[]): PairResult[] {
  const closes = points.map((p) => p.close);
  const volumes = points.map((p) => p.volume);
  const trends = points.map((p) => p.trend);
  const news = points.map((p) => p.newsCount);
  const returns = dailyReturns(closes);

  const trendsActive = trends.some((v) => v != null && v > 0);
  const newsActive = news.some((v) => v > 0);
  const volActive = volumes.some((v) => v > 0);

  const buildPair = (
    key: string,
    label: string,
    xLabel: string,
    yLabel: string,
    hint: string,
    x: (number | null | undefined)[],
    y: (number | null | undefined)[],
    xActive: boolean,
    yActive: boolean,
    xName: string,
    yName: string,
  ): PairResult => {
    if (!xActive || !yActive) {
      return {
        key,
        label,
        xLabel,
        yLabel,
        hint,
        lags: LAGS.map((L) => ({ lag: L, r: null, n: 0 })),
        peak: null,
        available: false,
        reason: !xActive ? `${xName} 데이터 없음` : `${yName} 데이터 없음`,
      };
    }
    const lp = leadLag(x, y, LAGS);
    const peak = bestPeak(lp);
    const available = peak !== null;
    return {
      key,
      label,
      xLabel,
      yLabel,
      hint,
      lags: lp,
      peak,
      available,
      reason: available ? undefined : "유효 표본 부족 (lag별 N < 14)",
    };
  };

  return [
    buildPair(
      "trend_vs_return",
      "검색 관심도 → 가격 변화율",
      "검색",
      "수익률",
      "양(+)의 lag에서 큰 |r| → 검색이 가격을 선행하는 경향",
      trends,
      returns,
      trendsActive,
      true,
      "검색 관심도",
      "가격",
    ),
    buildPair(
      "trend_vs_volume",
      "검색 관심도 → 거래량",
      "검색",
      "거래량",
      "검색 변화가 며칠 뒤 거래량으로 이어지는지",
      trends,
      volumes,
      trendsActive,
      volActive,
      "검색 관심도",
      "거래량",
    ),
    buildPair(
      "news_vs_volume",
      "뉴스량 → 거래량",
      "뉴스",
      "거래량",
      "뉴스 보도가 매매로 반영되는 시차",
      news,
      volumes,
      newsActive,
      volActive,
      "뉴스량",
      "거래량",
    ),
  ];
}
