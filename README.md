# 시장 심리 흐름 시각화 대시보드

검색량 · 뉴스량 · 감성 · 거래량 · 가격을 **하나의 날짜축 위에 정렬**해
시장 심리의 흐름을 관찰하는 분석 대시보드. 가격 예측 도구가 아닙니다.

> 매수/매도 추천이 아닙니다. "오를 확률" 같은 단정적 표현은 사용하지 않습니다.

## 빠른 시작

```bash
npm install
npm run dev      # http://localhost:3000 (mock 데이터로 동작)
```

실 데이터 수집(yfinance / pytrends / Google News RSS)은 Python venv 세팅이
필요합니다 — [docs/SETUP.md](docs/SETUP.md) 참고.

## 문서

| 문서 | 용도 |
|------|------|
| [docs/PROJECT_SPEC.md](docs/PROJECT_SPEC.md) | 원본 프로젝트 명세서 |
| [docs/PROGRESS.md](docs/PROGRESS.md) | 단계별 완성 상태, 합의된 설계 결정, 검증 안 된 영역, 다음 할 일 |
| [docs/SETUP.md](docs/SETUP.md) | 새 컴퓨터에서 처음 받았을 때 셋업 가이드 (OS별 차이 포함) |

## 디자인 원칙

- 트레이딩 앱이 아닌 **분석 대시보드** 톤. 채도 낮은 중립 팔레트, 부호
  구분(+/−)에만 색.
- 표현은 *관찰* 중심: "관심 증가", "거래량 동반", "검색 지속성", "과열
  가능성", "비대칭". 예측·추천 단어 금지.
- Google Trends는 절대 검색량이 아닌 **선택 기간·지역 내 최대값=100으로
  정규화된 상대 관심도**임을 UI에 명시.

## 라이선스

WIP. 비상업적 학습 용도.
