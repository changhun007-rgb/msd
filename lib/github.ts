// GitHub API 헬퍼 — 배포(GitHub 모드)에서 종목 추가를 처리한다.
//   1) tickers.json 을 코드 브랜치에 커밋 (Contents API)
//   2) fetch-data 워크플로를 해당 종목으로 트리거 (workflow_dispatch)
//
// 필요한 환경변수:
//   MSD_DATA_REPO    "owner/repo"
//   MSD_DATA_REF     코드 브랜치 (기본 main)
//   MSD_GITHUB_TOKEN repo 의 Contents:write + Actions:write 권한 토큰

import type { TickerMeta } from "@/types";

const API = "https://api.github.com";
const TICKERS_PATH = "data/keywords/tickers.json";
const WORKFLOW_FILE = "fetch-data.yml";

function repo(): string {
  const r = process.env.MSD_DATA_REPO;
  if (!r) throw new Error("MSD_DATA_REPO not set");
  return r;
}

function codeRef(): string {
  return process.env.MSD_DATA_REF ?? "main";
}

function token(): string {
  const t = process.env.MSD_GITHUB_TOKEN;
  if (!t) throw new Error("MSD_GITHUB_TOKEN not set");
  return t;
}

async function gh(pathname: string, init?: RequestInit): Promise<Response> {
  return fetch(`${API}${pathname}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token()}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json",
      "User-Agent": "msd-dashboard",
      ...init?.headers,
    },
  });
}

// UTF-8 안전 base64 (Node Buffer 우선, 없으면 Web API 폴백).
function encodeBase64(text: string): string {
  if (typeof Buffer !== "undefined") {
    return Buffer.from(text, "utf8").toString("base64");
  }
  const bytes = new TextEncoder().encode(text);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

function decodeBase64(b64: string): string {
  const clean = b64.replace(/\n/g, "");
  if (typeof Buffer !== "undefined") {
    return Buffer.from(clean, "base64").toString("utf8");
  }
  const bin = atob(clean);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

// tickers.json 을 GitHub 에서 직접 읽고(최신 sha 포함) 새 종목을 추가해 커밋.
// 이미 존재하면 throw.
export async function addTickerViaGithub(meta: TickerMeta): Promise<void> {
  const getRes = await gh(
    `/repos/${repo()}/contents/${TICKERS_PATH}?ref=${codeRef()}`,
  );

  let sha: string | undefined;
  let map: Record<string, TickerMeta> = {};
  if (getRes.ok) {
    const j = (await getRes.json()) as { sha: string; content: string };
    sha = j.sha;
    map = JSON.parse(decodeBase64(j.content)) as Record<string, TickerMeta>;
  } else if (getRes.status !== 404) {
    throw new Error(
      `tickers.json 읽기 실패: ${getRes.status} ${await getRes.text()}`,
    );
  }

  if (map[meta.ticker]) {
    throw new Error(`ticker already exists: ${meta.ticker}`);
  }
  map[meta.ticker] = meta;

  const newText = JSON.stringify(map, null, 2) + "\n";
  const putRes = await gh(`/repos/${repo()}/contents/${TICKERS_PATH}`, {
    method: "PUT",
    body: JSON.stringify({
      message: `feat: add ticker ${meta.ticker}`,
      content: encodeBase64(newText),
      branch: codeRef(),
      ...(sha ? { sha } : {}),
    }),
  });
  if (!putRes.ok) {
    throw new Error(
      `tickers.json 커밋 실패: ${putRes.status} ${await putRes.text()}`,
    );
  }
}

// fetch-data 워크플로를 특정 종목으로 수동 트리거.
export async function dispatchFetch(ticker: string): Promise<void> {
  const res = await gh(
    `/repos/${repo()}/actions/workflows/${WORKFLOW_FILE}/dispatches`,
    {
      method: "POST",
      body: JSON.stringify({ ref: codeRef(), inputs: { ticker } }),
    },
  );
  // 성공 시 204 No Content
  if (!res.ok && res.status !== 204) {
    throw new Error(
      `workflow dispatch 실패: ${res.status} ${await res.text()}`,
    );
  }
}
