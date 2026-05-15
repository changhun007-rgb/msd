"use client";

import { useCallback, useEffect, useState } from "react";
import IntegratedChart, {
  type Visibility,
} from "@/components/IntegratedChart";
import IndicatorToggle from "@/components/IndicatorToggle";
import TickerSearch, {
  type TickerCacheStatus,
} from "@/components/TickerSearch";
import AddTickerForm from "@/components/AddTickerForm";
import NewsPanel from "@/components/NewsPanel";
import SentimentChart from "@/components/SentimentChart";
import EventMarkers from "@/components/EventMarkers";
import CorrelationPanel from "@/components/CorrelationPanel";
import InterpretationPanel from "@/components/InterpretationPanel";
import SourceBadge from "@/components/SourceBadge";
import { buildMockSeries } from "@/lib/mockData";
import type {
  IntegratedSeries,
  Interval,
  Region,
  TickerMeta,
} from "@/types";

const PERIODS = [
  { label: "30D", days: 30 },
  { label: "60D", days: 60 },
  { label: "90D", days: 90 },
  { label: "180D", days: 180 },
];

function formatCollectedAt(iso: string | undefined): string | null {
  if (!iso) return null;
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

interface PendingFetch {
  ticker: string;
  status: { stock: boolean; trends: boolean; news: boolean } | null;
}

export default function Page() {
  const [tickers, setTickers] = useState<TickerMeta[]>([]);
  const [tickerStatus, setTickerStatus] = useState<
    Record<string, TickerCacheStatus>
  >({});
  const [symbol, setSymbol] = useState<string>("TSLA");
  const [region, setRegion] = useState<Region>("US");
  const [periodDays, setPeriodDays] = useState(90);
  const [chartInterval, setChartInterval] = useState<Interval>("1d");
  const [pending, setPending] = useState<PendingFetch | null>(null);
  const [visibility, setVisibility] = useState<Visibility>({
    price: true,
    priceMA: true,
    volume: true,
    trend: true,
    news: true,
    sentimentPos: true,
    sentimentNeg: true,
  });

  const [series, setSeries] = useState<IntegratedSeries | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [focusDate, setFocusDate] = useState<string | null>(null);

  const fetchSeries = useCallback(async () => {
    setLoading(true);
    setError(null);
    setFocusDate(null);
    try {
      const qs = new URLSearchParams({
        region,
        days: String(periodDays),
        interval: chartInterval,
      });
      const res = await fetch(
        `/api/series/${encodeURIComponent(symbol)}?${qs.toString()}`,
        { cache: "no-store" },
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as IntegratedSeries;
      setSeries(data);
    } catch (e) {
      // API 호출 자체가 실패해도 화면이 비지 않도록 로컬 mock으로 폴백
      const fallback = buildMockSeries(symbol, region, periodDays);
      setSeries({
        ...fallback,
        interval: chartInterval,
        sources: { price: "mock", trends: "mock", news: "mock" },
      });
      setError(e instanceof Error ? e.message : "fetch failed");
    } finally {
      setLoading(false);
    }
  }, [symbol, region, periodDays, chartInterval]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchSeries();
  }, [fetchSeries]);

  // 자동 새로고침: 시간봉 모드에서는 1분 주기, 일봉에선 5분 주기.
  // 백엔드 scheduler 가 매시간 캐시를 갱신하므로 페이지가 떠있으면 자연스럽게 추가됨.
  useEffect(() => {
    const ms = chartInterval === "1h" ? 60_000 : 5 * 60_000;
    const id = window.setInterval(() => {
      void fetchSeries();
    }, ms);
    return () => window.clearInterval(id);
  }, [fetchSeries, chartInterval]);

  // 종목 목록 + 캐시 상태를 서버에서 동적으로 로드.
  // 추가 종목이 즉시 드롭다운에 반영되어야 하므로 매 마운트에 fresh fetch.
  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const res = await fetch("/api/tickers", { cache: "no-store" });
        if (!res.ok) return;
        const json = (await res.json()) as {
          tickers: TickerMeta[];
          status?: Record<string, TickerCacheStatus>;
        };
        if (!alive) return;
        setTickers(json.tickers);
        setTickerStatus(json.status ?? {});
        if (!json.tickers.find((t) => t.ticker === symbol)) {
          const first = json.tickers[0];
          if (first) {
            setSymbol(first.ticker);
            setRegion(first.region);
          }
        }
      } catch {
        // tickers.json 자체가 없으면 빈 목록으로 둔다 — 첫 화면이 mock 으로 그려짐.
      }
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 새 종목 추가 직후 캐시가 채워질 때까지 polling.
  useEffect(() => {
    if (!pending) return;
    let alive = true;
    const id = setInterval(async () => {
      try {
        const res = await fetch(
          `/api/tickers/${encodeURIComponent(pending.ticker)}/status`,
          { cache: "no-store" },
        );
        if (!res.ok) return;
        const status = (await res.json()) as {
          stock: boolean;
          trends: boolean;
          news: boolean;
        };
        if (!alive) return;
        setPending((p) => (p ? { ...p, status } : p));
        setTickerStatus((prev) => ({ ...prev, [pending.ticker]: status }));
        // stock 만 채워지면 차트가 의미를 가지므로 그 시점에 자동 새로고침.
        if (status.stock && pending.ticker === symbol) {
          void fetchSeries();
        }
        // 3채널 모두 도착하면 polling 종료.
        if (status.stock && status.trends && status.news) {
          clearInterval(id);
          setPending(null);
        }
      } catch {
        // 무시
      }
    }, 3000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [pending, symbol, fetchSeries]);

  const handleAdded = (meta: TickerMeta) => {
    setTickers((prev) =>
      prev.find((t) => t.ticker === meta.ticker) ? prev : [...prev, meta],
    );
    setTickerStatus((prev) => ({
      ...prev,
      [meta.ticker]: { stock: false, trends: false, news: false },
    }));
    setSymbol(meta.ticker);
    setRegion(meta.region);
    setPending({ ticker: meta.ticker, status: null });
  };

  const usingMockPrice = series?.sources?.price === "mock";
  const collectedAt = formatCollectedAt(series?.collectedAt);

  return (
    <main className="mx-auto flex min-h-screen max-w-[1400px] flex-col gap-4 px-6 py-5 text-gray-900">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 pb-3">
        <div>
          <h1 className="text-lg font-semibold text-gray-900">
            시장 심리 흐름 시각화 대시보드
          </h1>
          <p className="text-xs text-gray-500">
            관심·검색·뉴스·감성·가격을 한 화면에서 관찰합니다. 가격 예측 도구가 아닙니다.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <SourceBadge sources={series?.sources} />
          {pending && (
            <span className="rounded-md border border-sky-200 bg-sky-50 px-2 py-1 text-xs text-sky-700">
              {pending.ticker} 수집 중 — stock:
              {pending.status?.stock ? "✓" : "…"} news:
              {pending.status?.news ? "✓" : "…"} trends:
              {pending.status?.trends ? "✓" : "…"}
            </span>
          )}
          {usingMockPrice && (
            <span className="rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-xs text-amber-700">
              가격 mock — Python 수집기 실행 시 yfinance로 전환
            </span>
          )}
        </div>
      </header>

      <section className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <TickerSearch
            tickers={tickers}
            selected={symbol}
            region={region}
            status={tickerStatus}
            onSelect={(s) => {
              setSymbol(s);
              const m = tickers.find((t) => t.ticker === s);
              if (m) setRegion(m.region);
            }}
            onRegion={setRegion}
          />
          <AddTickerForm onAdded={handleAdded} />
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1">
            <span className="text-sm font-medium text-gray-700">단위</span>
            {(["1d", "1h"] as Interval[]).map((iv) => (
              <button
                key={iv}
                type="button"
                onClick={() => setChartInterval(iv)}
                className={
                  "rounded-md border px-2 py-1 text-xs transition " +
                  (iv === chartInterval
                    ? "border-gray-800 bg-gray-900 text-white"
                    : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50")
                }
              >
                {iv === "1d" ? "일봉" : "시간봉"}
              </button>
            ))}
          </div>
          {chartInterval === "1d" && (
            <div className="flex items-center gap-1">
              <span className="text-sm font-medium text-gray-700">기간</span>
              {PERIODS.map((p) => (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => setPeriodDays(p.days)}
                  className={
                    "rounded-md border px-2 py-1 text-xs transition " +
                    (p.days === periodDays
                      ? "border-gray-800 bg-gray-900 text-white"
                      : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50")
                  }
                >
                  {p.label}
                </button>
              ))}
            </div>
          )}
          <button
            type="button"
            onClick={fetchSeries}
            disabled={loading}
            className="rounded-md border border-gray-200 bg-white px-2 py-1 text-xs text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            {loading ? "불러오는 중…" : "새로고침"}
          </button>
        </div>
      </section>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          데이터 로드 실패: {error} — 로컬 mock으로 표시 중
        </div>
      )}

      {series && (
        <section className="grid flex-1 grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="flex min-h-[600px] flex-col gap-3">
            <IndicatorToggle value={visibility} onChange={setVisibility} />
            <div className="flex-1">
              <IntegratedChart
                series={series}
                visibility={visibility}
                focusDate={focusDate}
              />
            </div>
            {collectedAt && (
              <div className="text-[11px] text-gray-400">
                수집 시점: {collectedAt}
              </div>
            )}
          </div>

          <aside className="flex flex-col gap-4">
            <div className="rounded-lg border border-gray-200 bg-white p-3">
              <SentimentChart series={series} />
            </div>
            <div className="min-h-[300px] flex-1 rounded-lg border border-gray-200 bg-white p-3">
              <NewsPanel series={series} />
            </div>
          </aside>
        </section>
      )}

      {series && (
        <section className="rounded-lg border border-gray-200 bg-white p-4">
          <CorrelationPanel series={series} />
        </section>
      )}

      {series && (
        <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="rounded-lg border border-gray-200 bg-white p-3">
            <EventMarkers series={series} onSelect={setFocusDate} />
          </div>
          <div className="rounded-lg border border-gray-200 bg-white p-3">
            <InterpretationPanel series={series} />
          </div>
        </section>
      )}

      <footer className="mt-2 border-t border-gray-200 pt-3 text-xs text-gray-400">
        Google Trends는 절대 검색량이 아닌 상대 관심도 지표입니다 (선택 기간/지역 내 최대값=100으로
        정규화). 본 대시보드는 가격을 예측하지 않으며, 매수/매도 추천이 아닙니다.
      </footer>
    </main>
  );
}
