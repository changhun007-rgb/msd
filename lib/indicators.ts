// 관심/가격 흐름 해석용 지표 계산
// 명세대로: 이동평균, 증가율, 스파이크 감지, 수익률 등

export function sma(values: number[], window: number): (number | null)[] {
  const out: (number | null)[] = [];
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= window) sum -= values[i - window];
    out.push(i >= window - 1 ? sum / window : null);
  }
  return out;
}

export function pctChange(values: number[], lag = 1): (number | null)[] {
  return values.map((v, i) => {
    if (i < lag) return null;
    const prev = values[i - lag];
    if (prev === 0 || prev == null) return null;
    return ((v - prev) / prev) * 100;
  });
}

// 스파이크: z-score 기반. 최근 window 평균/표준편차 대비 threshold 초과 시 true
export function spikes(
  values: number[],
  window = 14,
  threshold = 2,
): boolean[] {
  const out: boolean[] = [];
  for (let i = 0; i < values.length; i++) {
    if (i < window) {
      out.push(false);
      continue;
    }
    const slice = values.slice(i - window, i);
    const mean = slice.reduce((a, b) => a + b, 0) / window;
    const variance =
      slice.reduce((a, b) => a + (b - mean) ** 2, 0) / window;
    const std = Math.sqrt(variance);
    out.push(std > 0 && (values[i] - mean) / std > threshold);
  }
  return out;
}

// 단순 일간 수익률 (%)
export function dailyReturn(close: number[]): (number | null)[] {
  return pctChange(close, 1);
}
