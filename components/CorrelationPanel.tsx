"use client";

// 리드/래그 분석 자리(Step 5).
// MVP에서는 placeholder를 두고, Step 5에서 -7~+7일 상관 히트맵으로 채운다.

export default function CorrelationPanel() {
  return (
    <div>
      <h3 className="mb-2 text-sm font-semibold text-gray-800">리드/래그 분석</h3>
      <div className="rounded border border-dashed border-gray-300 bg-gray-50 px-3 py-6 text-center text-sm text-gray-500">
        Step 5에서 구현 예정 — 검색량/뉴스량/거래량/가격의 -7~+7일 상관 히트맵.
        <br />
        <span className="text-xs text-gray-400">
          (이 화면의 목적은 예측이 아니라, 어떤 시그널이 먼저 움직이는 경향이 있는지 관찰)
        </span>
      </div>
    </div>
  );
}
