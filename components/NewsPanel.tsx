"use client";

// 실 뉴스 캐시(recentNews)가 있으면 그걸 우선 표시,
// 없으면 mock 시리즈의 newsCount > 0인 날짜에서 합성 헤드라인을 보여준다.

import type { IntegratedSeries, NewsItem } from "@/types";

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

function tone(pos: number, neg: number): string {
  if (pos > neg) return "text-emerald-700";
  if (neg > pos) return "text-red-700";
  return "text-gray-600";
}

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function RealNewsList({ items }: { items: NewsItem[] }) {
  if (items.length === 0) {
    return (
      <p className="text-xs text-gray-400">
        수집된 기사가 없습니다. <code>npm run data:news</code> 실행 후 새로고침하세요.
      </p>
    );
  }
  return (
    <ul className="flex-1 space-y-2 overflow-y-auto pr-1 text-sm">
      {items.map((it, idx) => (
        <li
          key={(it.link || it.title) + idx}
          className="rounded border border-gray-100 bg-white px-2.5 py-2"
        >
          <div className="flex items-center justify-between text-xs text-gray-400">
            <span>{formatTime(it.publishedAt)}</span>
            <span className={tone(it.pos, it.neg)}>
              +{it.pos} / -{it.neg}
            </span>
          </div>
          <a
            href={it.link}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-0.5 block text-gray-800 hover:text-blue-700 hover:underline"
          >
            {it.title}
          </a>
          {it.source && (
            <div className="text-xs text-gray-500">{it.source}</div>
          )}
        </li>
      ))}
    </ul>
  );
}

function MockNewsList({ series }: { series: IntegratedSeries }) {
  const recent = [...series.points]
    .filter((p) => p.newsCount > 0)
    .slice(-10)
    .reverse();
  return (
    <ul className="flex-1 space-y-2 overflow-y-auto pr-1 text-sm">
      {recent.map((p, idx) => {
        const headline = MOCK_HEADLINES[idx % MOCK_HEADLINES.length];
        return (
          <li
            key={p.date + idx}
            className="rounded border border-gray-100 bg-white px-2.5 py-2"
          >
            <div className="flex items-center justify-between text-xs text-gray-400">
              <span>{p.date}</span>
              <span className={tone(p.posScore, p.negScore)}>
                +{p.posScore} / -{p.negScore}
              </span>
            </div>
            <div className="mt-0.5 text-gray-800">{headline}</div>
            <div className="text-xs text-gray-500">기사 수 {p.newsCount}</div>
          </li>
        );
      })}
    </ul>
  );
}

export default function NewsPanel({ series }: Props) {
  const isReal = series.sources?.news === "google-news-rss";
  return (
    <div className="flex h-full flex-col">
      <h3 className="mb-2 text-sm font-semibold text-gray-800">
        최근 뉴스 {isReal ? "(Google News RSS)" : "(mock)"}
      </h3>
      {isReal && series.recentNews ? (
        <RealNewsList items={series.recentNews} />
      ) : (
        <MockNewsList series={series} />
      )}
    </div>
  );
}
