"""공용 유틸: 경로, 티커 매핑 로더, JSON atomic write."""

from __future__ import annotations

import json
import os
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable

ROOT = Path(__file__).resolve().parents[2]
KEYWORDS_FILE = ROOT / "data" / "keywords" / "tickers.json"
CACHE_DIR = Path(os.environ.get("CACHE_DIR", ROOT / "data" / "cache"))


@dataclass(frozen=True)
class TickerMeta:
    ticker: str
    display: str
    region: str
    trends_keywords: tuple[str, ...]


def load_tickers() -> dict[str, TickerMeta]:
    raw = json.loads(KEYWORDS_FILE.read_text(encoding="utf-8"))
    out: dict[str, TickerMeta] = {}
    for k, v in raw.items():
        out[k] = TickerMeta(
            ticker=v["ticker"],
            display=v["display"],
            region=v["region"],
            trends_keywords=tuple(v.get("trendsKeywords", [])),
        )
    return out


def iso_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def safe_name(ticker: str) -> str:
    """파일명에 안전하게 쓰도록 영숫자/일부 기호 외 모두 _ 치환."""
    return "".join(c if c.isalnum() or c in "._-" else "_" for c in ticker)


def write_json(path: Path, payload: dict) -> Path:
    """원자적 쓰기: tmp에 쓰고 rename."""
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    tmp.replace(path)
    return path


def stock_cache_path(ticker: str) -> Path:
    return CACHE_DIR / f"{safe_name(ticker)}_stock.json"


def resolve_tickers(argv: Iterable[str]) -> list[str]:
    """CLI 인자가 있으면 그 종목들만, 없으면 매핑 파일 전체."""
    cli = [a for a in argv if not a.startswith("-")]
    if cli:
        return cli
    return list(load_tickers().keys())
