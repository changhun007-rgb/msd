"use client";

import type { Visibility } from "./IntegratedChart";

interface Props {
  value: Visibility;
  onChange: (v: Visibility) => void;
}

const ITEMS: { key: keyof Visibility; label: string }[] = [
  { key: "price", label: "가격" },
  { key: "priceMA", label: "가격 이동평균" },
  { key: "volume", label: "거래량" },
  { key: "trend", label: "검색량" },
  { key: "news", label: "뉴스량" },
  { key: "sentimentPos", label: "긍정 감성" },
  { key: "sentimentNeg", label: "부정 감성" },
];

export default function IndicatorToggle({ value, onChange }: Props) {
  return (
    <div className="flex flex-wrap gap-2">
      {ITEMS.map((it) => {
        const active = value[it.key];
        return (
          <button
            key={it.key}
            type="button"
            onClick={() => onChange({ ...value, [it.key]: !active })}
            className={
              "rounded-md border px-2.5 py-1 text-xs transition " +
              (active
                ? "border-gray-800 bg-gray-900 text-white"
                : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50")
            }
            aria-pressed={active}
          >
            {it.label}
          </button>
        );
      })}
    </div>
  );
}
