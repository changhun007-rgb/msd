"""아주 단순한 키워드 사전 기반 감성 점수기.

- 영어: 소문자화 후 단어 단위 매칭 (\\b 기준)
- 한국어: 형태소 분석기 의존을 피하고 부분 문자열 매칭
  (조사/어미가 붙어도 잡히도록 — 정밀도보다 재현율 우선)

NLP 모델/외부 API 의존성 없음. 결정론적이라 같은 입력은 같은 점수.
스펙상 "아주 거친 추론"이라는 한계를 그대로 받아들이는 구현.
"""

from __future__ import annotations

import re

POS_EN: set[str] = {
    "surge", "surges", "beat", "beats", "record", "soar", "soars", "jump", "jumps",
    "growth", "profit", "profits", "upgrade", "upgraded", "breakthrough",
    "partnership", "expand", "expands", "win", "wins", "approve", "approved",
    "milestone", "rally", "rallies", "strong", "positive", "gain", "gains",
    "outperform", "outperforms", "high", "highs", "tops", "exceed", "exceeds",
    "boost", "boosts", "bullish", "rise", "rises", "rebound",
}

NEG_EN: set[str] = {
    "miss", "misses", "plunge", "plunges", "drop", "drops", "lawsuit", "recall",
    "probe", "downgrade", "downgraded", "layoff", "layoffs", "fraud", "ban",
    "decline", "declines", "fall", "falls", "sue", "sued", "crash", "crashes",
    "slump", "slumps", "warning", "fine", "fines", "loss", "losses", "weak",
    "negative", "cut", "cuts", "downturn", "investigation", "concern",
    "concerns", "fears", "bearish", "tumble", "tumbles", "halt", "halted",
}

POS_KO: list[str] = [
    "호조", "급등", "신고가", "호실적", "흑자", "상승", "돌파", "호평", "수주",
    "인수", "성장", "강세", "신기록", "매수", "개선", "확대", "최대", "훈풍",
    "상향", "회복", "반등",
]

NEG_KO: list[str] = [
    "부진", "급락", "적자", "하락", "손실", "리콜", "소송", "조사", "감산",
    "약세", "매도", "경고", "추락", "폭락", "위기", "우려", "감소", "축소",
    "하향", "제재", "리스크",
]

_WORD_RE = re.compile(r"[A-Za-z']+")


def score(text: str) -> tuple[int, int]:
    """(pos_count, neg_count) 반환."""
    if not text:
        return (0, 0)
    pos = neg = 0
    for tok in _WORD_RE.findall(text.lower()):
        if tok in POS_EN:
            pos += 1
        elif tok in NEG_EN:
            neg += 1
    for w in POS_KO:
        if w in text:
            pos += 1
    for w in NEG_KO:
        if w in text:
            neg += 1
    return (pos, neg)
