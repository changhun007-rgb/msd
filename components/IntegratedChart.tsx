"use client";

// 통합 차트: 하나의 날짜축 위에 가격/거래량/검색량/뉴스량/감성을 다중 pane으로 표시.
// lightweight-charts v5의 multi-pane(addSeries에 paneIndex 전달)을 사용한다.
// 사용자는 IndicatorToggle로 각 시리즈의 visible을 제어한다.

import { useEffect, useMemo, useRef, useState } from "react";
import {
  CandlestickSeries,
  HistogramSeries,
  LineSeries,
  createChart,
  createSeriesMarkers,
  type IChartApi,
  type ISeriesApi,
  type ISeriesMarkersPluginApi,
  type SeriesMarker,
  type Time,
  type UTCTimestamp,
} from "lightweight-charts";
import type { IntegratedSeries } from "@/types";
import { sma } from "@/lib/indicators";
import { detectEvents, type MarketEvent } from "@/lib/events";

export interface Visibility {
  price: boolean;
  priceMA: boolean;
  volume: boolean;
  trend: boolean;
  news: boolean;
  sentimentPos: boolean;
  sentimentNeg: boolean;
}

interface Props {
  series: IntegratedSeries;
  visibility: Visibility;
  focusDate?: string | null;
}

// "YYYY-MM-DD" (일봉) 또는 "YYYY-MM-DDTHH:MM:SS+00:00" (시간봉) 둘 다 처리.
function toTime(s: string): UTCTimestamp {
  const iso = s.length === 10 ? s + "T00:00:00Z" : s;
  return (new Date(iso).getTime() / 1000) as UTCTimestamp;
}

function toMarker(e: MarketEvent): SeriesMarker<Time> {
  const time = toTime(e.date);
  switch (e.kind) {
    case "search-surge":
      return {
        time,
        position: "aboveBar",
        shape: "circle",
        color: "#7c3aed",
        size: 1,
      };
    case "news-burst":
      return {
        time,
        position: "aboveBar",
        shape: "square",
        color: "#64748b",
        size: 1,
      };
    case "price-up":
      return {
        time,
        position: "belowBar",
        shape: "arrowUp",
        color: "#16a34a",
        text: `+${e.magnitude.toFixed(1)}%`,
        size: 1,
      };
    case "price-down":
      return {
        time,
        position: "aboveBar",
        shape: "arrowDown",
        color: "#dc2626",
        text: `${e.magnitude.toFixed(1)}%`,
        size: 1,
      };
    case "volume-surge":
      return {
        time,
        position: "belowBar",
        shape: "square",
        color: "#3b82f6",
        size: 1,
      };
  }
}

interface HoverInfo {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  trend: number | null;
  newsCount: number;
}

export default function IntegratedChart({
  series,
  visibility,
  focusDate,
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const intervalRef = useRef(series.interval);
  intervalRef.current = series.interval;
  const [hover, setHover] = useState<HoverInfo | null>(null);

  // 가장 최근 봉을 기본 표시값으로 사용 (마우스 안 올렸을 때).
  const latest = useMemo<HoverInfo | null>(() => {
    const pts = series.points;
    if (pts.length === 0) return null;
    const p = pts[pts.length - 1];
    return {
      time: p.date,
      open: p.open,
      high: p.high,
      low: p.low,
      close: p.close,
      trend: p.trend,
      newsCount: p.newsCount,
    };
  }, [series]);
  const seriesRef = useRef<{
    candle?: ISeriesApi<"Candlestick">;
    priceMA?: ISeriesApi<"Line">;
    volume?: ISeriesApi<"Histogram">;
    trend?: ISeriesApi<"Line">;
    news?: ISeriesApi<"Histogram">;
    pos?: ISeriesApi<"Line">;
    neg?: ISeriesApi<"Line">;
    markers?: ISeriesMarkersPluginApi<Time>;
  }>({});

  // 차트 1회 생성 + 컨테이너 리사이즈 핸들링
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const chart = createChart(el, {
      autoSize: true,
      layout: {
        background: { color: "#ffffff" },
        textColor: "#374151",
        fontSize: 11,
        panes: { separatorColor: "#e5e7eb", separatorHoverColor: "#9ca3af" },
      },
      grid: {
        vertLines: { color: "#f3f4f6" },
        horzLines: { color: "#f3f4f6" },
      },
      rightPriceScale: { borderColor: "#e5e7eb" },
      timeScale: { borderColor: "#e5e7eb", timeVisible: false },
      crosshair: { mode: 1 },
    });
    chartRef.current = chart;

    // 마우스 크로스헤어 위치 → hover state.
    const handler = (param: Parameters<
      Parameters<typeof chart.subscribeCrosshairMove>[0]
    >[0]) => {
      if (!param.time || !param.seriesData) {
        setHover(null);
        return;
      }
      const candle = seriesRef.current.candle;
      const trend = seriesRef.current.trend;
      const news = seriesRef.current.news;
      const cd = candle ? param.seriesData.get(candle) : undefined;
      const cdObj = cd as unknown as
        | { open?: number; high?: number; low?: number; close?: number }
        | undefined;
      if (!cdObj || typeof cdObj.open !== "number") {
        setHover(null);
        return;
      }
      const ohlc = {
        open: cdObj.open,
        high: cdObj.high ?? cdObj.open,
        low: cdObj.low ?? cdObj.open,
        close: cdObj.close ?? cdObj.open,
      };
      const td = trend ? param.seriesData.get(trend) : undefined;
      const tdObj = td as unknown as { value?: number } | undefined;
      const trendVal =
        tdObj && typeof tdObj.value === "number" ? tdObj.value : null;
      const nd = news ? param.seriesData.get(news) : undefined;
      const ndObj = nd as unknown as { value?: number } | undefined;
      const newsVal =
        ndObj && typeof ndObj.value === "number"
          ? Math.round(ndObj.value)
          : 0;

      const t = param.time as number;
      // UTC 초 → KST 포맷. interval 은 ref 로 latest 값 참조.
      const d = new Date(t * 1000);
      const fmt = d.toLocaleString("ko-KR", {
        timeZone: "Asia/Seoul",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        ...(intervalRef.current === "1h"
          ? { hour: "2-digit", minute: "2-digit", hour12: false }
          : {}),
      });
      setHover({
        time: fmt,
        open: ohlc.open,
        high: ohlc.high,
        low: ohlc.low,
        close: ohlc.close,
        trend: trendVal,
        newsCount: newsVal,
      });
    };
    chart.subscribeCrosshairMove(handler);

    return () => {
      chart.unsubscribeCrosshairMove(handler);
      chart.remove();
      chartRef.current = null;
      seriesRef.current = {};
    };
  }, []);

  // interval 에 따라 시간 표시 토글 + 한국 시간(KST) 로 라벨 변환.
  // 데이터(UTC) 자체는 손대지 않고 표기만 KST 로.
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    const tz = "Asia/Seoul";
    const isHourly = series.interval === "1h";

    const tickFmt = (time: Time): string => {
      const d = new Date((time as number) * 1000);
      if (isHourly) {
        return d.toLocaleString("ko-KR", {
          timeZone: tz,
          month: "numeric",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
        });
      }
      return d.toLocaleDateString("ko-KR", {
        timeZone: tz,
        month: "numeric",
        day: "numeric",
      });
    };

    const fullFmt = (time: Time): string => {
      const d = new Date((time as number) * 1000);
      return d.toLocaleString("ko-KR", {
        timeZone: tz,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        ...(isHourly
          ? { hour: "2-digit", minute: "2-digit", hour12: false }
          : {}),
      });
    };

    chart.applyOptions({
      timeScale: {
        timeVisible: isHourly,
        secondsVisible: false,
        tickMarkFormatter: tickFmt,
      },
      localization: {
        locale: "ko-KR",
        timeFormatter: fullFmt,
      },
    });
  }, [series.interval]);

  // series 데이터 주입/갱신
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;

    // 기존 시리즈/마커 제거 (티커가 바뀌면 새로 그린다)
    seriesRef.current.markers?.detach();
    const oldSeries = [
      seriesRef.current.candle,
      seriesRef.current.priceMA,
      seriesRef.current.volume,
      seriesRef.current.trend,
      seriesRef.current.news,
      seriesRef.current.pos,
      seriesRef.current.neg,
    ];
    oldSeries.forEach((s) => s && chart.removeSeries(s));
    seriesRef.current = {};

    const pts = series.points;

    // Pane 0 - Candles + MA(close,20)
    const candle = chart.addSeries(CandlestickSeries, {
      upColor: "#16a34a",
      downColor: "#dc2626",
      borderUpColor: "#16a34a",
      borderDownColor: "#dc2626",
      wickUpColor: "#16a34a",
      wickDownColor: "#dc2626",
    }, 0);
    candle.setData(
      pts.map((p) => ({
        time: toTime(p.date),
        open: p.open,
        high: p.high,
        low: p.low,
        close: p.close,
      })),
    );

    const closes = pts.map((p) => p.close);
    const ma20 = sma(closes, 20);
    const priceMA = chart.addSeries(LineSeries, {
      color: "#2563eb",
      lineWidth: 1,
      priceLineVisible: false,
      lastValueVisible: false,
    }, 0);
    priceMA.setData(
      pts
        .map((p, i) => ({ time: toTime(p.date), value: ma20[i] }))
        .filter((d): d is { time: UTCTimestamp; value: number } => d.value != null),
    );

    // Pane 1 - Volume
    const volume = chart.addSeries(HistogramSeries, {
      priceFormat: { type: "volume" },
      color: "#94a3b8",
      priceLineVisible: false,
    }, 1);
    volume.setData(
      pts.map((p) => ({
        time: toTime(p.date),
        value: p.volume,
        color: p.close >= p.open ? "#86efac" : "#fca5a5",
      })),
    );

    // Pane 2 - Google Trends (0-100)
    const trend = chart.addSeries(LineSeries, {
      color: "#7c3aed",
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: true,
    }, 2);
    // trend 가 null 인 날짜는 whitespace 로 두어 차트에서 끊김(gap)으로 표시.
    trend.setData(
      pts.map((p) =>
        p.trend == null
          ? { time: toTime(p.date) }
          : { time: toTime(p.date), value: p.trend },
      ),
    );

    // Pane 3 - 뉴스량(히스토그램) + 긍정/부정 감성(라인 오버레이)
    const news = chart.addSeries(HistogramSeries, {
      color: "#cbd5e1",
      priceLineVisible: false,
      priceFormat: { type: "volume" },
    }, 3);
    news.setData(pts.map((p) => ({ time: toTime(p.date), value: p.newsCount })));

    const pos = chart.addSeries(LineSeries, {
      color: "#16a34a",
      lineWidth: 1,
      priceScaleId: "sentiment",
      priceLineVisible: false,
      lastValueVisible: false,
    }, 3);
    pos.setData(pts.map((p) => ({ time: toTime(p.date), value: p.posScore })));

    const neg = chart.addSeries(LineSeries, {
      color: "#dc2626",
      lineWidth: 1,
      priceScaleId: "sentiment",
      priceLineVisible: false,
      lastValueVisible: false,
    }, 3);
    neg.setData(pts.map((p) => ({ time: toTime(p.date), value: p.negScore })));

    // 이벤트 마커: candle 시리즈 위에 시간순으로
    const events = detectEvents(pts).sort((a, b) =>
      a.date.localeCompare(b.date),
    );
    const markersData = events.map(toMarker);
    const markers = createSeriesMarkers(candle, markersData);

    seriesRef.current = {
      candle,
      priceMA,
      volume,
      trend,
      news,
      pos,
      neg,
      markers,
    };
    chart.timeScale().fitContent();
  }, [series]);

  // 외부에서 선택한 날짜로 차트 중앙 이동
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || !focusDate) return;
    const ts = toTime(focusDate);
    const from = (ts - 5 * 24 * 3600) as UTCTimestamp;
    const to = (ts + 5 * 24 * 3600) as UTCTimestamp;
    chart.timeScale().setVisibleRange({ from, to });
  }, [focusDate]);

  // visibility 토글 반영
  useEffect(() => {
    const r = seriesRef.current;
    r.candle?.applyOptions({ visible: visibility.price });
    r.priceMA?.applyOptions({ visible: visibility.priceMA });
    r.volume?.applyOptions({ visible: visibility.volume });
    r.trend?.applyOptions({ visible: visibility.trend });
    r.news?.applyOptions({ visible: visibility.news });
    r.pos?.applyOptions({ visible: visibility.sentimentPos });
    r.neg?.applyOptions({ visible: visibility.sentimentNeg });
  }, [visibility]);

  const info = hover ?? latest;
  // latest 의 time 은 ISO/date 문자열이라 KST 포맷으로 변환.
  const infoTimeLabel = (() => {
    if (!info) return "";
    if (hover) return info.time; // 이미 포맷됨
    const raw = info.time;
    const iso = raw.length === 10 ? raw + "T00:00:00Z" : raw;
    const d = new Date(iso);
    return d.toLocaleString("ko-KR", {
      timeZone: "Asia/Seoul",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      ...(series.interval === "1h"
        ? { hour: "2-digit", minute: "2-digit", hour12: false }
        : {}),
    });
  })();
  const fmtPrice = (n: number) =>
    n >= 10000 ? n.toLocaleString() : n.toFixed(2);

  return (
    <div className="flex h-full w-full flex-col">
      {/* sticky 헤더: 차트 영역이 viewport 안에 있는 동안 항상 상단에 고정.
          색깔 라벨 + 호버한 봉의 OHLC/검색/뉴스 정보 한 줄에 노출. */}
      <div className="sticky top-0 z-30 -mx-1 mb-2 border-b border-gray-100 bg-white/95 px-1 py-1.5 backdrop-blur-sm">
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
          <span><span className="inline-block h-2 w-2 rounded-sm bg-gray-800 align-middle" /> 가격</span>
          <span><span className="inline-block h-2 w-2 rounded-sm bg-slate-400 align-middle" /> 거래량</span>
          <span><span className="inline-block h-2 w-2 rounded-sm bg-violet-600 align-middle" /> 검색량(Google Trends 0-100)</span>
          <span><span className="inline-block h-2 w-2 rounded-sm bg-slate-300 align-middle" /> 뉴스량</span>
          <span><span className="inline-block h-2 w-2 rounded-sm bg-green-600 align-middle" /> 긍정</span>
          <span><span className="inline-block h-2 w-2 rounded-sm bg-red-600 align-middle" /> 부정</span>
        </div>
        {info && (
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] leading-tight text-gray-700">
            <span className="font-medium text-gray-900">
              {infoTimeLabel}
              {!hover && (
                <span className="ml-1 text-[10px] font-normal text-gray-400">
                  · 최신
                </span>
              )}
            </span>
            <span>
              <span className="text-gray-400">시</span> {fmtPrice(info.open)}
            </span>
            <span>
              <span className="text-gray-400">고</span> {fmtPrice(info.high)}
            </span>
            <span>
              <span className="text-gray-400">저</span> {fmtPrice(info.low)}
            </span>
            <span className="font-medium">
              <span className="text-gray-400">종</span> {fmtPrice(info.close)}
            </span>
            <span>
              <span className="text-gray-400">검색</span>{" "}
              {info.trend == null ? "—" : info.trend}
            </span>
            <span>
              <span className="text-gray-400">뉴스</span> {info.newsCount}
            </span>
          </div>
        )}
      </div>
      <div
        ref={containerRef}
        className="min-h-[520px] flex-1 rounded border border-gray-200"
      />
    </div>
  );
}
