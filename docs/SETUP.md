# 새 컴퓨터에서 처음 받았다면

이 가이드는 저장소를 처음 클론한 PC에서 데이터 수집 + 대시보드 실행까지
끝내는 단계별 절차다. 진행 현황과 설계 결정은 [PROGRESS.md](./PROGRESS.md),
원본 명세는 [PROJECT_SPEC.md](./PROJECT_SPEC.md) 참고.

---

## 사전 요구

| 도구 | 최소 | 권장 | 비고 |
|------|------|------|------|
| Node.js | 18.18 | **20 LTS** | `nvm` 권장. Next.js 16은 18.18+ 필수. |
| Python | 3.10 | 3.11 | f-string union 타입(`str \| None`) 사용. |
| Git | 최신 | | |
| OS | macOS / Linux / WSL2 / Windows | | venv 활성 명령만 OS별로 다름. |

확인:
```bash
node --version    # v18.18+ (v20+ 권장)
python3 --version # 3.10+
git --version
```

> Python이 `python`은 있는데 `python3`가 없는 환경(주로 Windows)에서는 이
> 문서의 `python3`를 `python`으로 바꿔 읽으면 된다.

---

## 1) 클론 + Node 의존성

```bash
git clone <repo-url> msd
cd msd
npm install
```

## 2) Python 가상환경 + 수집 의존성

### macOS / Linux / WSL
```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r scripts/python/requirements.txt
```

### Windows (PowerShell)
```powershell
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r scripts/python/requirements.txt
```

### Windows (Git Bash / cmd)
```bash
python -m venv .venv
.venv/Scripts/activate     # Git Bash
# 또는 cmd: .venv\Scripts\activate.bat
pip install -r scripts/python/requirements.txt
```

> 활성화되면 셸 프롬프트 앞에 `(.venv)` 가 보인다. 안 보이면 같은 셸에서
> 다시 활성화 명령 실행.

설치되는 것: `yfinance`, `pandas`, `pytrends`, `feedparser`,
`python-dateutil`.

## 3) (선택) 종목 추가/수정

`data/keywords/tickers.json` 편집. 기본 5종목으로 충분히 검증 가능.

```jsonc
"247540.KQ": {
  "ticker": "247540.KQ",
  "display": "에코프로비엠",
  "region": "KR",
  "trendsKeywords": ["에코프로비엠", "EcoPro BM", "247540"]
}
```

한국 종목 접미사 — **자주 헷갈리는 부분**:
- 코스피: `.KS` (예: `005930.KS` 삼성전자)
- 코스닥: `.KQ` (예: `247540.KQ` 에코프로비엠)

## 4) 데이터 수집

venv 활성 상태에서 한 번에:
```bash
npm run data:all          # stock → trends → news 순차 (5종목 약 1~2분)
```

개별:
```bash
npm run data:stocks       # yfinance 일봉 OHLCV (6개월)
npm run data:trends       # pytrends 일별 (today 3-m, 8s 종목 간격)
npm run data:news         # Google News RSS + 감성
```

특정 종목만:
```bash
python3 scripts/python/fetch_stock.py TSLA
python3 scripts/python/fetch_trends.py 005930.KS
python3 scripts/python/fetch_news.py NVDA TSLA
```

캐시 점검:
```bash
npm run data:inspect              # 모든 종목 한 줄 요약
npm run data:inspect -- TSLA      # 특정 종목
python3 scripts/python/inspect_cache.py --raw TSLA   # JSON 앞부분도
```

정상 출력 예시:
```
=== TSLA ===
  stock  :  126 rows | fetched=2026-...
           2025-11-12 → 2026-05-13  close 245.30 → 263.10
  trends :   91 rows | geo=US tf=today 3-m kw=['Tesla','TSLA stock','테슬라']
           2026-02-12 → 2026-05-13  min=18 max=100 last=72
  news   :   80 items / 7 days | lang=en-US geo=US
           total pos=24 neg=11
           latest: [Reuters] ...
```

## 5) 개발 서버

```bash
npm run dev
# http://localhost:3000
```

좌상단 **SourceBadge** 가 각 채널의 출처를 표시:
- 녹색: 실데이터 (`yfinance` / `pytrends` / `google-news-rss`)
- 노란색: 캐시 없음 → mock 폴백 (해당 수집기 미실행 또는 실패)

## 6) 빌드 확인

```bash
npm run build
```

---

## 자주 발생하는 에러 / 대처법

### `pytrends 429 / TooManyRequests`
- 가장 흔함. Google Trends는 비공식 API라 IP 단위 throttle.
- 우리 코드: 종목 간 8초 sleep + 내부 backoff 2회 적용.
- 대처:
  1. 종목 하나씩만: `python3 scripts/python/fetch_trends.py TSLA`, 몇 분 대기 후 다음
  2. VPN/네트워크 전환 후 재시도
  3. 단기 IP 차단은 보통 30분~수시간 후 자동 해제
  4. trends 캐시 없는 종목은 trend 채널만 mock 폴백 — **stock/news는 영향 없음**

### yfinance가 `0 rows` 출력
- 접미사 확인 (`.KS` vs `.KQ`)
- 야후 페이지 직접 확인: `https://finance.yahoo.com/quote/<TICKER>`
- 장 마감 직후 당일 비어있을 수 있음 — 다음 날 재시도
- 종목이 신규 상장 / 상장폐지 / 합병 등일 가능성도 확인

### Google News RSS 결과가 영어로만 나옴
- `tickers.json` 의 region이 `KR` 인지 확인
- 브라우저에서 RSS URL 직접 확인:
  ```
  https://news.google.com/rss/search?q=삼성전자&hl=ko&gl=KR&ceid=KR:ko
  ```

### `Node version too old`
- Node 20 LTS로 업그레이드. Next.js 16은 18.18 미만 거부.
- `nvm install 20 && nvm use 20`

### `ModuleNotFoundError: No module named 'yfinance'`
- venv 미활성. `source .venv/bin/activate` (또는 OS별 명령) 먼저.
- 프롬프트 앞에 `(.venv)` 보이는지 확인.

### 캐시 파일은 있는데 페이지에 mock 배지 그대로
- 페이지 새로고침 (캐시는 `no-store` 라 즉시 반영되어야 정상)
- `npm run data:inspect <티커>` 로 캐시에 실제 데이터가 있는지
- dev 서버 재시작 (`Ctrl+C` → `npm run dev`)

### Windows PowerShell `Activate.ps1` 실행 정책 에러
```powershell
Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned
# 한 번만 실행하면 됨
```

### Windows에서 `python3` 명령이 없음
- Microsoft Store 버전 Python은 `python` 만 제공. 본 가이드의 `python3`를
  `python` 으로 바꿔 사용.
- 또는 `python.org` 설치본을 쓰면 둘 다 동작.

### macOS Apple Silicon에서 `pandas` 설치 느림
- 보통 wheel이 캐시돼 빠르지만, 캐시 미스 시 빌드되며 1~2분 걸릴 수 있음.
- `pip install -r ... --prefer-binary` 로 강제.

### `EADDRINUSE: 3000`
- 다른 프로세스가 3000 점유. `PORT=3001 npm run dev` 로 다른 포트.

---

## OS별 차이 정리

| 항목 | macOS / Linux / WSL | Windows |
|------|----------------------|---------|
| venv 활성 | `source .venv/bin/activate` | `.venv\Scripts\Activate.ps1` (PS) / `.venv\Scripts\activate.bat` (cmd) |
| Python 명령 | `python3` | `python` (또는 `python3` 둘 다) |
| 셸 종료 | `Ctrl+C` | 동일 |
| 경로 구분자 | `/` | `\` (단, Node/Python은 `/` 도 허용) |
| RSS 한글 URL | 그대로 동작 | 동일 (요청은 urlencode됨) |

---

## 검증 체크리스트

수집 끝나면 다음을 차례로 확인:

- [ ] `npm run data:inspect` 출력에서 5종목 모두 `stock`/`trends`/`news` 행이
      `(no cache)` 가 아님
- [ ] 각 종목 stock은 `points` 수 ≥ 100
- [ ] 각 종목 trends는 `points` 수 ≥ 60
- [ ] 각 종목 news는 `items` ≥ 30
- [ ] 페이지 좌상단 **SourceBadge** 3개 채널 모두 녹색
- [ ] 차트에 마커가 표시됨 (보라 원/회색 사각/녹·적 화살표 중 일부)
- [ ] 이벤트 패널 항목 클릭 → 인라인 디테일 카드 + 헤드라인 + 차트 줌
- [ ] 상관 패널 heatmap에 색이 칠해진 칸이 보임 (모두 회색이면 `available=false`)
- [ ] 종목 전환·기간 전환 시 위 모든 동작 유지

문제 발견 시 [PROGRESS.md](./PROGRESS.md) 의 "검증 안 된 영역" 섹션을 함께
참고하고, `npm run data:inspect` 출력 + Python stderr 메시지를 챙겨서 다시
세션을 이어가면 된다.
