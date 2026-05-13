"use client";

import type { SeriesSources, SourceTag } from "@/types";

const LABEL: Record<SourceTag, string> = {
  mock: "mock",
  yfinance: "yfinance",
  pytrends: "pytrends",
  "google-news-rss": "RSS",
  newsapi: "NewsAPI",
};

function tone(tag: SourceTag): string {
  return tag === "mock"
    ? "border-amber-200 bg-amber-50 text-amber-700"
    : "border-emerald-200 bg-emerald-50 text-emerald-700";
}

interface Props {
  sources?: SeriesSources;
}

export default function SourceBadge({ sources }: Props) {
  if (!sources) return null;
  const items: { key: keyof SeriesSources; label: string }[] = [
    { key: "price", label: "가격" },
    { key: "trends", label: "검색" },
    { key: "news", label: "뉴스" },
  ];
  return (
    <div className="flex flex-wrap gap-1.5 text-[11px]">
      {items.map((it) => {
        const tag = sources[it.key];
        return (
          <span
            key={it.key}
            className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 ${tone(tag)}`}
          >
            <span className="text-gray-500">{it.label}</span>
            <span className="font-medium">{LABEL[tag]}</span>
          </span>
        );
      })}
    </div>
  );
}
