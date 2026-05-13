"use client";

// 통합 차트: 하나의 날짜축 위에 가격/거래량/검색량/뉴스량/감성을 다중 pane으로 표시.
// lightweight-charts v5의 multi-pane(addSeries에 paneIndex 전달)을 사용한다.
// 사용자는 IndicatorToggle로 각 시리즈의 visible을 제어한다.

import { useEffect, useRef } from "react";
import {
  CandlestickSeries,
  HistogramSeries,
  LineSeries,
  createChart,
  type IChartApi,
  type ISeriesApi,
  type UTCTimestamp,
} from "lightweight-charts";
import type { IntegratedSeries } from "@/types";
import { sma } from "@/lib/indicators";

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
}

function toTime(date: string): UTCTimestamp {
  return (new Date(date + "T00:00:00Z").getTime() / 1000) as UTCTimestamp;
}

export default function IntegratedChart({ series, visibility }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<{
    candle?: ISeriesApi<"Candlestick">;
    priceMA?: ISeriesApi<"Line">;
    volume?: ISeriesApi<"Histogram">;
    trend?: ISeriesApi<"Line">;
    news?: ISeriesApi<"Histogram">;
    pos?: ISeriesApi<"Line">;
    neg?: ISeriesApi<"Line">;
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

    return () => {
      chart.remove();
      chartRef.current = null;
      seriesRef.current = {};
    };
  }, []);

  // series 데이터 주입/갱신
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;

    // 기존 시리즈 제거 (티커가 바뀌면 새로 그린다)
    Object.values(seriesRef.current).forEach((s) => s && chart.removeSeries(s));
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
    trend.setData(pts.map((p) => ({ time: toTime(p.date), value: p.trend })));

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

    seriesRef.current = { candle, priceMA, volume, trend, news, pos, neg };
    chart.timeScale().fitContent();
  }, [series]);

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

  return (
    <div className="flex h-full w-full flex-col">
      <div className="mb-2 flex gap-4 text-xs text-gray-500">
        <span><span className="inline-block h-2 w-2 rounded-sm bg-gray-800 align-middle" /> 가격</span>
        <span><span className="inline-block h-2 w-2 rounded-sm bg-slate-400 align-middle" /> 거래량</span>
        <span><span className="inline-block h-2 w-2 rounded-sm bg-violet-600 align-middle" /> 검색량(Google Trends 0-100)</span>
        <span><span className="inline-block h-2 w-2 rounded-sm bg-slate-300 align-middle" /> 뉴스량</span>
        <span><span className="inline-block h-2 w-2 rounded-sm bg-green-600 align-middle" /> 긍정</span>
        <span><span className="inline-block h-2 w-2 rounded-sm bg-red-600 align-middle" /> 부정</span>
      </div>
      <div ref={containerRef} className="min-h-[520px] flex-1 rounded border border-gray-200" />
    </div>
  );
}
