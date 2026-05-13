"""Google Trends(pytrends) 수집기.

종목별 trendsKeywords 그룹(최대 5개)을 한 번의 pytrends 요청으로 보내고,
키워드별 시계열을 평균낸 "그룹 대표 1개" 일별 시계열을 저장한다.

cache/{ticker}_trends.json:
{
  "ticker": "TSLA",
  "geo": "US",
  "timeframe": "today 3-m",
  "keywords": ["Tesla","TSLA stock","테슬라"],
  "fetchedAt": "...",
  "points": [
    {"date": "YYYY-MM-DD", "trend": 0-100, "sma7": float, "wow": float|null}, ...
  ]
}

pytrends는 비공식 API라 429를 자주 받음. 종목 간 SLEEP_BETWEEN 보수적으로.
"""

from __future__ import annotations

import sys
import time
import traceback
from pathlib import Path

import pandas as pd
from pytrends.request import TrendReq

from common import (
    TickerMeta,
    iso_now,
    load_tickers,
    resolve_tickers,
    trends_cache_path,
    write_json,
)

TIMEFRAME = "today 3-m"
SLEEP_BETWEEN = 8.0


def geo_for_region(region: str) -> str:
    return {"US": "US", "KR": "KR"}.get(region.upper(), "")


def empty_payload(meta: TickerMeta, geo: str, keywords: list[str]) -> dict:
    return {
        "ticker": meta.ticker,
        "geo": geo,
        "timeframe": TIMEFRAME,
        "keywords": keywords,
        "fetchedAt": iso_now(),
        "points": [],
    }


def fetch_one(meta: TickerMeta) -> dict:
    keywords = list(meta.trends_keywords)[:5]
    geo = geo_for_region(meta.region)

    if not keywords:
        return empty_payload(meta, geo, keywords)

    pytrends = TrendReq(hl="en-US", tz=0, retries=2, backoff_factor=1.0)
    pytrends.build_payload(keywords, timeframe=TIMEFRAME, geo=geo)
    df = pytrends.interest_over_time()

    if df is None or df.empty:
        return empty_payload(meta, geo, keywords)

    if "isPartial" in df.columns:
        df = df.drop(columns=["isPartial"])

    # 그룹 대표: 키워드별 시계열의 평균
    series = df.mean(axis=1).round().astype(int)
    sma7 = series.rolling(7, min_periods=1).mean().round(2)
    prev7 = series.shift(7)
    wow = ((series - prev7) / prev7.replace(0, pd.NA) * 100).round(2)

    points: list[dict] = []
    for date, val in series.items():
        w = wow.get(date)
        points.append({
            "date": date.strftime("%Y-%m-%d"),
            "trend": int(val),
            "sma7": float(sma7.get(date)),
            "wow": None if pd.isna(w) else float(w),
        })

    return {
        "ticker": meta.ticker,
        "geo": geo,
        "timeframe": TIMEFRAME,
        "keywords": keywords,
        "fetchedAt": iso_now(),
        "points": points,
    }


def main(argv: list[str]) -> int:
    tickers = resolve_tickers(argv[1:])
    metas = load_tickers()
    if not tickers:
        print("[warn] no tickers to fetch", file=sys.stderr)
        return 1

    failures = 0
    for i, t in enumerate(tickers):
        meta = metas.get(t)
        if meta is None:
            print(f"[skip] {t}: no meta in tickers.json", file=sys.stderr)
            continue
        try:
            data = fetch_one(meta)
            path: Path = trends_cache_path(t)
            write_json(path, data)
            print(
                f"[ok] {t}: {len(data['points'])} rows (geo={data['geo']}) → {path}"
            )
        except Exception as e:
            failures += 1
            print(f"[err] {t}: {e}", file=sys.stderr)
            traceback.print_exc()
        if i < len(tickers) - 1:
            time.sleep(SLEEP_BETWEEN)

    return 0 if failures == 0 else 2


if __name__ == "__main__":
    sys.exit(main(sys.argv))
