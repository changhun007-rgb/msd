// 데이터 소스 추상화 — 로컬 파일시스템 vs GitHub raw.
//
// 환경변수 MSD_DATA_REPO ("owner/repo") 가 설정돼 있으면 GitHub raw 모드.
//   - Cloudflare 배포 환경: serverless 라 디스크가 없음 → GitHub raw 에서 읽음
//   - 로컬 개발: 변수 미설정 → 기존처럼 data/ 파일을 직접 읽음
//
// 두 종류의 데이터가 서로 다른 브랜치에 산다:
//   - tickers.json (종목 목록) → 코드 브랜치   (MSD_DATA_REF,  기본 main)
//     경로: data/keywords/tickers.json
//   - 캐시 JSON (수집 결과)     → data 브랜치    (MSD_CACHE_REF, 기본 data)
//     경로: 브랜치 루트에 평면 배치 ({filename})
//     (GitHub Actions 가 매시간 force-push 로 통째 덮어씀)

import fs from "node:fs/promises";
import path from "node:path";
import { getCloudflareContext } from "@opennextjs/cloudflare";

// Cloudflare Workers 런타임에서는 환경변수가 process.env 가 아니라
// getCloudflareContext().env 에 들어온다. 로컬/빌드 환경은 process.env 폴백.
export function readEnv(key: string): string | undefined {
  try {
    const { env } = getCloudflareContext();
    const v = (env as Record<string, unknown> | undefined)?.[key];
    if (typeof v === "string" && v.length > 0) return v;
  } catch {
    // getCloudflareContext 를 쓸 수 없는 컨텍스트 (빌드 등) — process.env 로.
  }
  const pv = process.env[key];
  return pv && pv.length > 0 ? pv : undefined;
}

export function isGithubMode(): boolean {
  return !!readEnv("MSD_DATA_REPO");
}

function rawUrl(ref: string, pathInRepo: string): string {
  const repo = readEnv("MSD_DATA_REPO") as string;
  return `https://raw.githubusercontent.com/${repo}/${ref}/${pathInRepo}`;
}

async function fetchRaw(ref: string, pathInRepo: string): Promise<string | null> {
  try {
    const res = await fetch(rawUrl(ref, pathInRepo), { cache: "no-store" });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

async function readLocal(absPath: string): Promise<string | null> {
  try {
    return await fs.readFile(absPath, "utf8");
  } catch {
    return null;
  }
}

function cacheDir(): string {
  return process.env.CACHE_DIR ?? path.join(process.cwd(), "data", "cache");
}

// 캐시 파일 텍스트. 없으면 null.
//   로컬: data/cache/{filename}
//   GitHub: data 브랜치 루트의 {filename}
export async function readCacheText(
  filename: string,
): Promise<string | null> {
  if (isGithubMode()) {
    const ref = readEnv("MSD_CACHE_REF") ?? "data";
    return fetchRaw(ref, filename);
  }
  return readLocal(path.join(cacheDir(), filename));
}

// tickers.json 텍스트. 없으면 null.
//   로컬: data/keywords/tickers.json
//   GitHub: 코드 브랜치의 data/keywords/tickers.json
export async function readKeywordsText(): Promise<string | null> {
  if (isGithubMode()) {
    const ref = readEnv("MSD_DATA_REF") ?? "main";
    return fetchRaw(ref, "data/keywords/tickers.json");
  }
  return readLocal(
    path.join(process.cwd(), "data", "keywords", "tickers.json"),
  );
}

// 캐시 파일 존재 여부 (status 체크용).
export async function cacheFileExists(filename: string): Promise<boolean> {
  return (await readCacheText(filename)) !== null;
}
