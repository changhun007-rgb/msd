// 임시 진단용 엔드포인트 — 환경변수가 런타임에 어디 있는지 확인.
// 원인 파악 후 삭제 예정. 값은 노출하지 않고 키 존재 여부만 반환.

import { NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";

export const dynamic = "force-dynamic";

export async function GET() {
  const out: Record<string, unknown> = { marker: "debug-v1" };

  // process.env 쪽
  out.processEnvMSD = Object.keys(process.env).filter((k) =>
    k.startsWith("MSD_"),
  );

  // getCloudflareContext().env 쪽
  try {
    const { env } = getCloudflareContext();
    out.cfContextOk = true;
    if (env) {
      const keys = Object.keys(env as Record<string, unknown>);
      out.cfEnvAllKeys = keys;
      out.cfEnvMSD = keys.filter((k) => k.startsWith("MSD_"));
    } else {
      out.cfEnvAllKeys = null;
    }
  } catch (e) {
    out.cfContextOk = false;
    out.cfError = e instanceof Error ? e.message : String(e);
  }

  return NextResponse.json(out, {
    headers: { "Cache-Control": "no-store" },
  });
}
