// 키워드 사전 기반 감성 분석 (MVP)
// 향후 OpenAI/HuggingFace로 교체할 수 있도록 함수 시그니처를 단순하게 유지한다.

export const POSITIVE_WORDS: ReadonlySet<string> = new Set([
  // 한국어
  "호재", "실적", "기대", "성장", "계약", "투자", "급등", "신고가", "흑자",
  // 영어
  "bullish", "beat", "growth", "profit", "surge", "rally", "upgrade",
  "outperform", "record", "breakthrough",
]);

export const NEGATIVE_WORDS: ReadonlySet<string> = new Set([
  // 한국어
  "악재", "폭락", "규제", "소송", "거품", "우려", "급락", "적자", "리콜",
  // 영어
  "bearish", "crash", "downgrade", "loss", "miss", "plunge", "lawsuit",
  "probe", "halt", "warning",
]);

export interface SentimentScore {
  posScore: number;
  negScore: number;
}

// 한글/영문 모두 처리. 소문자화 + 공백/구두점 분리.
export function scoreText(text: string): SentimentScore {
  if (!text) return { posScore: 0, negScore: 0 };
  const tokens = text
    .toLowerCase()
    .replace(/[.,!?()[\]{}"'`~/\\|<>:;]/g, " ")
    .split(/\s+/);

  let pos = 0;
  let neg = 0;
  for (const t of tokens) {
    if (!t) continue;
    if (POSITIVE_WORDS.has(t)) pos += 1;
    if (NEGATIVE_WORDS.has(t)) neg += 1;
  }
  return { posScore: pos, negScore: neg };
}
