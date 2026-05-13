"""Google News RSS 수집기 (무료, API 키 불필요).

종목별 trendsKeywords 그룹을 OR 쿼리로 묶어 region별 RSS 피드를 가져오고,
제목+요약에 키워드 사전 기반 감성 점수를 부여한 뒤
일자별 집계 + 기사 목록을 캐시한다.

cache/{ticker}_news.json:
{
  "ticker": "TSLA",
  "query": "Tesla OR \\"TSLA stock\\" OR 테슬라",
  "lang": "en-US",
  "geo": "US",
  "fetchedAt": "...",
  "items": [
    {"date":"YYYY-MM-DD","publishedAt":"iso","title":"...","link":"...","source":"...","pos":int,"neg":int}, ...
  ],
  "byDay": [
    {"date":"YYYY-MM-DD","count":int,"pos":int,"neg":int}, ...
  ]
}
"""

from __future__ import annotations

import sys
import time
import traceback
import urllib.parse
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

import feedparser

from common import (
    TickerMeta,
    iso_now,
    load_tickers,
    news_cache_path,
    resolve_tickers,
    write_json,
)
from sentiment import score

SLEEP_BETWEEN = 2.0
MAX_ENTRIES = 80


def lang_geo(region: str) -> tuple[str, str, str]:
    region = region.upper()
    if region == "KR":
        return ("ko", "KR", "KR:ko")
    return ("en-US", "US", "US:en")


def build_query(keywords: list[str]) -> str:
    parts = []
    for kw in keywords:
        parts.append(f'"{kw}"' if " " in kw else kw)
    return " OR ".join(parts)


def parse_published(entry) -> tuple[str, str]:
    """returns (date YYYY-MM-DD UTC, iso UTC)."""
    pp = entry.get("published_parsed") or entry.get("updated_parsed")
    if pp is None:
        now = datetime.now(timezone.utc)
        return now.strftime("%Y-%m-%d"), now.isoformat()
    dt = datetime(*pp[:6], tzinfo=timezone.utc)
    return dt.strftime("%Y-%m-%d"), dt.isoformat()


def entry_source(entry) -> str | None:
    src = entry.get("source")
    if isinstance(src, dict):
        return src.get("title")
    if hasattr(src, "get"):
        return src.get("title")
    return None


def fetch_one(meta: TickerMeta) -> dict:
    keywords = list(meta.trends_keywords) or [meta.ticker]
    lang, geo, ceid = lang_geo(meta.region)
    query = build_query(keywords)
    qp = urllib.parse.urlencode(
        {"q": query, "hl": lang, "gl": geo, "ceid": ceid}
    )
    url = f"https://news.google.com/rss/search?{qp}"

    parsed = feedparser.parse(url)

    items: list[dict] = []
    by_day: dict[str, dict[str, int]] = defaultdict(
        lambda: {"count": 0, "pos": 0, "neg": 0}
    )

    for e in parsed.entries[:MAX_ENTRIES]:
        title = e.get("title", "") or ""
        summary = e.get("summary", "") or ""
        pos, neg = score(f"{title}\n{summary}")
        date_str, iso = parse_published(e)
        items.append({
            "date": date_str,
            "publishedAt": iso,
            "title": title,
            "link": e.get("link", ""),
            "source": entry_source(e),
            "pos": pos,
            "neg": neg,
        })
        agg = by_day[date_str]
        agg["count"] += 1
        agg["pos"] += pos
        agg["neg"] += neg

    items.sort(key=lambda x: x["publishedAt"], reverse=True)
    days = sorted(by_day.keys())

    return {
        "ticker": meta.ticker,
        "query": query,
        "lang": lang,
        "geo": geo,
        "fetchedAt": iso_now(),
        "items": items,
        "byDay": [{"date": d, **by_day[d]} for d in days],
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
            print(f"[skip] {t}: no meta", file=sys.stderr)
            continue
        try:
            data = fetch_one(meta)
            path: Path = news_cache_path(t)
            write_json(path, data)
            print(
                f"[ok] {t}: {len(data['items'])} items / {len(data['byDay'])} days → {path}"
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
