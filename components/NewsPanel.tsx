"use client";

// Step 1: mock 시리즈의 newsCount > 0 인 날짜에서 합성 헤드라인을 생성.
// Step 4에서 실제 RSS/NewsAPI 결과로 교체된다.

import type { IntegratedSeries } from "@/types";

interface Props {
  series: IntegratedSeries;
}

const MOCK_HEADLINES = [
  "분기 실적, 시장 컨센서스 상회 전망",
  "신규 계약 체결로 성장 기대감 확대",
  "규제 이슈 우려 부각",
  "대규모 투자 계획 발표",
  "주요 애널리스트 목표주가 상향",
  "공급망 차질 영향 가시화",
  "신제품 발표 임박 보도",
  "경쟁사 점유율 확대 우려",
];

export default function NewsPanel({ series }: Props) {
  const recent = [...series.points]
    .filter((p) => p.newsCount > 0)
    .slice(-10)
    .reverse();

  return (
    <div className="flex h-full flex-col">
      <h3 className="mb-2 text-sm font-semibold text-gray-800">최근 뉴스 (mock)</h3>
      <ul className="flex-1 space-y-2 overflow-y-auto pr-1 text-sm">
        {recent.map((p, idx) => {
          const tone =
            p.posScore > p.negScore
              ? "text-emerald-700"
              : p.negScore > p.posScore
                ? "text-red-700"
                : "text-gray-600";
          const headline = MOCK_HEADLINES[idx % MOCK_HEADLINES.length];
          return (
            <li
              key={p.date + idx}
              className="rounded border border-gray-100 bg-white px-2.5 py-2"
            >
              <div className="flex items-center justify-between text-xs text-gray-400">
                <span>{p.date}</span>
                <span className={tone}>
                  +{p.posScore} / -{p.negScore}
                </span>
              </div>
              <div className="mt-0.5 text-gray-800">{headline}</div>
              <div className="text-xs text-gray-500">기사 수 {p.newsCount}</div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
