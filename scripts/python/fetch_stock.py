"""yfinance 기반 일봉 OHLCV 수집기.

- 미국: TSLA, NVDA, AAPL ...
- 한국: 005930.KS (코스피), 086520.KQ (코스닥) 등 yfinance 접미사 그대로 사용

cache/{ticker}_stock.json 형태로 저장:
{
  "ticker": "TSLA",
  "fetchedAt": "2026-05-13T00:00:00+00:00",
  "period": "6mo",
  "interval": "1d",
  "points": [{"date": "YYYY-MM-DD", "open": ..., "high":..., "low":..., "close":..., "volume":...}, ...]
}

사용:
    python scripts/python/fetch_stock.py            # tickers.json 전부
    python scripts/python/fetch_stock.py TSLA NVDA  # 특정 종목만
"""

from __future__ import annotations

import math
import sys
import time
import traceback

import yfinance as yf

from common import iso_now, resolve_tickers, stock_cache_path, write_json

DEFAULT_PERIOD = "6mo"
DEFAULT_INTERVAL = "1d"
SLEEP_BETWEEN = 1.0  # 요청 사이 간격(초)


def fetch_one(ticker: str, period: str = DEFAULT_PERIOD, interval: str = DEFAULT_INTERVAL) -> dict:
    tk = yf.Ticker(ticker)
    df = tk.history(period=period, interval=interval, auto_adjust=False)

    points: list[dict] = []
    if df is not None and not df.empty:
        for date, row in df.iterrows():
            try:
                vol_raw = row["Volume"]
                vol = int(vol_raw) if not (isinstance(vol_raw, float) and math.isnan(vol_raw)) else 0
                points.append({
                    "date": date.strftime("%Y-%m-%d"),
                    "open": round(float(row["Open"]), 4),
                    "high": round(float(row["High"]), 4),
                    "low": round(float(row["Low"]), 4),
                    "close": round(float(row["Close"]), 4),
                    "volume": vol,
                })
            except (KeyError, TypeError, ValueError):
                # 결손행은 스킵
                continue

    return {
        "ticker": ticker,
        "fetchedAt": iso_now(),
        "period": period,
        "interval": interval,
        "points": points,
    }


def main(argv: list[str]) -> int:
    tickers = resolve_tickers(argv[1:])
    if not tickers:
        print("[warn] no tickers to fetch", file=sys.stderr)
        return 1

    failures = 0
    for i, t in enumerate(tickers):
        try:
            data = fetch_one(t)
            path = stock_cache_path(t)
            write_json(path, data)
            print(f"[ok] {t}: {len(data['points'])} rows → {path}")
        except Exception as e:
            failures += 1
            print(f"[err] {t}: {e}", file=sys.stderr)
            traceback.print_exc()
        if i < len(tickers) - 1:
            time.sleep(SLEEP_BETWEEN)

    return 0 if failures == 0 else 2


if __name__ == "__main__":
    sys.exit(main(sys.argv))
