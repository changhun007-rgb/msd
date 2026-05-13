"""모든 수집기 일괄 실행 (cron 대체).

Step 2: 주가만
Step 3,4: pytrends/news 추가 예정

사용:
    python scripts/python/scheduler.py
"""

from __future__ import annotations

import sys

from fetch_stock import main as run_stock
from fetch_trends import main as run_trends


def main() -> int:
    rc = 0
    print("=== stock (yfinance) ===")
    rc |= run_stock(["fetch_stock.py"])
    print("=== trends (pytrends) ===")
    rc |= run_trends(["fetch_trends.py"])
    # TODO Step 4: rc |= run_news(["fetch_news.py"])
    return rc


if __name__ == "__main__":
    sys.exit(main())
