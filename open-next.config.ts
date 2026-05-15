// OpenNext Cloudflare 어댑터 설정.
// 이 앱의 API 라우트는 모두 force-dynamic 이고 ISR 을 쓰지 않으므로
// incremental cache(R2 등) 오버라이드 없이 기본 구성으로 둔다.

import { defineCloudflareConfig } from "@opennextjs/cloudflare";

export default defineCloudflareConfig();
