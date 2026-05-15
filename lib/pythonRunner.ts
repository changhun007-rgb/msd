// 종목 추가 시 Python 수집기를 백그라운드로 실행하기 위한 헬퍼.
// - venv 위치를 OS 별로 자동 탐색. PYTHON_BIN 환경변수로 오버라이드 가능.
// - 응답을 막지 않도록 spawn 후 즉시 반환. 로그는 console 으로만 흘려보낸다.

import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

let resolved: string | null = null;

export function resolvePythonBin(): string {
  if (resolved) return resolved;
  const fromEnv = process.env.PYTHON_BIN;
  if (fromEnv && fs.existsSync(fromEnv)) {
    resolved = fromEnv;
    return resolved;
  }
  const root = process.cwd();
  const candidates = [
    path.join(root, ".venv", "Scripts", "python.exe"), // Windows
    path.join(root, ".venv", "bin", "python"), // macOS / Linux
    path.join(root, ".venv", "bin", "python3"),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) {
      resolved = c;
      return resolved;
    }
  }
  // 시스템 python 폴백 — PATH 에서 찾도록 이름만 반환.
  resolved = process.platform === "win32" ? "python" : "python3";
  return resolved;
}

// 한 스크립트를 ticker(+옵션 플래그)와 함께 실행하고 종료 코드를 Promise 로 반환.
export function runFetchScript(
  script: "fetch_stock" | "fetch_trends" | "fetch_news",
  ticker: string,
  extraArgs: string[] = [],
): Promise<{ code: number; stderr: string }> {
  const py = resolvePythonBin();
  const scriptPath = path.join(
    process.cwd(),
    "scripts",
    "python",
    `${script}.py`,
  );

  return new Promise((resolve) => {
    const child = spawn(py, [scriptPath, ticker, ...extraArgs], {
      cwd: process.cwd(),
      env: { ...process.env, PYTHONIOENCODING: "utf-8" },
    });
    let stderr = "";
    child.stderr.on("data", (b) => {
      stderr += b.toString();
    });
    child.stdout.on("data", (b) => {
      // dev 콘솔에 fetch 진행 로그를 그대로 흘려보낸다.
      process.stdout.write(`[${script} ${ticker}] ${b.toString()}`);
    });
    child.on("close", (code) => {
      resolve({ code: code ?? -1, stderr });
    });
    child.on("error", (err) => {
      resolve({ code: -1, stderr: String(err) });
    });
  });
}

// 종목 추가 시 일/시간봉 캐시를 한꺼번에 만든다.
// 순서: stock(1d) → stock(1h) → news → trends(1d) → trends(1h)
//   - news 는 byHour 까지 같은 파일에 들어가므로 한 번만 호출.
//   - trends 는 429 위험이 가장 크므로 가장 마지막. 1d → 1h 사이 10s sleep.
// 비동기로 백그라운드 실행만 한다. 결과는 캐시 파일 존재 여부로 polling.
export function runFetchAllBackground(ticker: string): void {
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
  void (async () => {
    try {
      const sd = await runFetchScript("fetch_stock", ticker);
      console.log(`[fetch_stock ${ticker}] exit ${sd.code}`);
      const sh = await runFetchScript("fetch_stock", ticker, ["--hourly"]);
      console.log(`[fetch_stock ${ticker} --hourly] exit ${sh.code}`);
      const n = await runFetchScript("fetch_news", ticker);
      console.log(`[fetch_news ${ticker}] exit ${n.code}`);
      const td = await runFetchScript("fetch_trends", ticker);
      console.log(`[fetch_trends ${ticker}] exit ${td.code}`);
      await sleep(10_000);
      const th = await runFetchScript("fetch_trends", ticker, ["--hourly"]);
      console.log(`[fetch_trends ${ticker} --hourly] exit ${th.code}`);
    } catch (e) {
      console.error(`[fetch_all ${ticker}] crashed`, e);
    }
  })();
}
