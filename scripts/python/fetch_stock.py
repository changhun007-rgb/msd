"""yfinance 기반 OHLCV 수집기 — 일봉(기본) 또는 시간봉.

cache/{ticker}_stock.json     일봉 6개월치
cache/{ticker}_stock_1h.json  시간봉 7일치

일봉 row:  {"date": "YYYY-MM-DD", "open": ..., "high":..., "low":..., "close":..., "volume":...}
시간봉 row:{"datetime": "YYYY-MM-DDTHH:MM:SS+00:00", "date": "YYYY-MM-DD", ...}

사용:
    python scripts/python/fetch_stock.py             # tickers.json 전부 일봉
    python scripts/python/fetch_stock.py TSLA NVDA   # 특정 종목 일봉
    python scripts/python/fetch_stock.py TSLA --hourly  # 시간봉 7일치
"""

from __future__ import annotations

import math
import sys
import time
import traceback

import pandas as pd
import yfinance as yf

from common import iso_now, resolve_tickers, stock_cache_path, write_json

DAILY_PERIOD = "6mo"
DAILY_INTERVAL = "1d"
HOURLY_PERIOD = "7d"
HOURLY_INTERVAL = "1h"
SLEEP_BETWEEN = 1.0  # 요청 사이 간격(초)


def fetch_one(ticker: str, period: str, interval: str) -> dict:
    tk = yf.Ticker(ticker)
    df = tk.history(period=period, interval=interval, auto_adjust=False)

    points: list[dict] = []
    is_hourly = interval != "1d"
    if df is not None and not df.empty:
        for ts, row in df.iterrows():
            try:
                vol_raw = row["Volume"]
                vol = int(vol_raw) if not (isinstance(vol_raw, float) and math.isnan(vol_raw)) else 0
                # 시간봉은 timezone-aware 인덱스 → UTC 로 정규화해서 ISO 저장
                if is_hourly:
                    ts_utc = ts.tz_convert("UTC") if isinstance(ts, pd.Timestamp) and ts.tzinfo else ts
                    iso = ts_utc.isoformat() if isinstance(ts_utc, pd.Timestamp) else str(ts_utc)
                    date_str = ts_utc.strftime("%Y-%m-%d") if isinstance(ts_utc, pd.Timestamp) else iso[:10]
                    row_data = {"datetime": iso, "date": date_str}
                else:
                    row_data = {"date": ts.strftime("%Y-%m-%d")}
                row_data.update({
                    "open": round(float(row["Open"]), 4),
                    "high": round(float(row["High"]), 4),
                    "low": round(float(row["Low"]), 4),
                    "close": round(float(row["Close"]), 4),
                    "volume": vol,
                })
                points.append(row_data)
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
    hourly = "--hourly" in argv
    args = [a for a in argv[1:] if not a.startswith("-")]
    tickers = resolve_tickers(args)
    if not tickers:
        print("[warn] no tickers to fetch", file=sys.stderr)
        return 1

    period = HOURLY_PERIOD if hourly else DAILY_PERIOD
    interval = HOURLY_INTERVAL if hourly else DAILY_INTERVAL

    failures = 0
    for i, t in enumerate(tickers):
        try:
            data = fetch_one(t, period, interval)
            path = stock_cache_path(t, interval)
            write_json(path, data)
            print(f"[ok] {t}: {len(data['points'])} rows ({interval}) → {path}")
        except Exception as e:
            failures += 1
            print(f"[err] {t}: {e}", file=sys.stderr)
            traceback.print_exc()
        if i < len(tickers) - 1:
            time.sleep(SLEEP_BETWEEN)

    return 0 if failures == 0 else 2


if __name__ == "__main__":
    sys.exit(main(sys.argv))
