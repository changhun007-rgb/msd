"""data/cache/ 점검용 헬퍼.

각 종목의 stock/trends/news 캐시 파일을 훑어 요약을 출력한다.
외부 의존성 없음. Python 3.10+.

사용:
    python scripts/python/inspect_cache.py            # 모든 종목
    python scripts/python/inspect_cache.py TSLA       # 특정 종목만
    python scripts/python/inspect_cache.py --raw TSLA # JSON 일부 raw 출력
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

from common import CACHE_DIR, load_tickers, safe_name


def load(path: Path) -> dict | None:
    if not path.exists():
        return None
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception as e:
        print(f"  [parse error] {path.name}: {e}")
        return None


def summarize(ticker: str) -> None:
    base = safe_name(ticker)
    stock = load(CACHE_DIR / f"{base}_stock.json")
    trends = load(CACHE_DIR / f"{base}_trends.json")
    news = load(CACHE_DIR / f"{base}_news.json")

    print(f"\n=== {ticker} ===")

    if stock:
        pts = stock.get("points", [])
        print(
            f"  stock  : {len(pts):>4} rows | fetched={stock.get('fetchedAt')}"
        )
        if pts:
            print(f"           {pts[0]['date']} → {pts[-1]['date']}  "
                  f"close {pts[0]['close']} → {pts[-1]['close']}")
    else:
        print("  stock  : (no cache)")

    if trends:
        pts = trends.get("points", [])
        print(
            f"  trends : {len(pts):>4} rows | geo={trends.get('geo')} "
            f"tf={trends.get('timeframe')} kw={trends.get('keywords')}"
        )
        if pts:
            vals = [p["trend"] for p in pts]
            print(
                f"           {pts[0]['date']} → {pts[-1]['date']}  "
                f"min={min(vals)} max={max(vals)} last={vals[-1]}"
            )
    else:
        print("  trends : (no cache)")

    if news:
        items = news.get("items", [])
        by_day = news.get("byDay", [])
        total_pos = sum(d.get("pos", 0) for d in by_day)
        total_neg = sum(d.get("neg", 0) for d in by_day)
        print(
            f"  news   : {len(items):>4} items / {len(by_day)} days | "
            f"lang={news.get('lang')} geo={news.get('geo')}"
        )
        print(
            f"           total pos={total_pos} neg={total_neg} | "
            f"query={news.get('query')!r}"
        )
        if items:
            top = items[0]
            print(f"           latest: [{top.get('source')}] {top.get('title')!s:.100}")
    else:
        print("  news   : (no cache)")


def main(argv: list[str]) -> int:
    show_raw = "--raw" in argv
    args = [a for a in argv[1:] if not a.startswith("--")]
    tickers = args if args else list(load_tickers().keys())

    print(f"cache dir: {CACHE_DIR}")
    if not CACHE_DIR.exists():
        print("(no cache dir — 아직 수집이 한번도 안 됨)")
        return 0

    for t in tickers:
        summarize(t)
        if show_raw:
            base = safe_name(t)
            for kind in ("stock", "trends", "news"):
                f = CACHE_DIR / f"{base}_{kind}.json"
                if f.exists():
                    print(f"\n  --- raw {kind} (first 800 chars) ---")
                    print("  " + f.read_text(encoding="utf-8")[:800].replace("\n", "\n  "))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
