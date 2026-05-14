# ReadMates Frontend

Before editing frontend code, read `../docs/agents/front.md`.

For UI, layout, copy, or visual polish, also read `../docs/agents/design.md`.

This package is the Vite React SPA plus Cloudflare Pages Functions BFF/OAuth proxy routes.

Successful frontend work preserves route-first boundaries, keeps BFF secrets out of browser-exposed configuration, and leaves the touched route usable across desktop and mobile.

Do not add Next/React Server Component directives such as `"use client"` to Vite source files.

Default checks:

```bash
pnpm --dir front lint
pnpm --dir front test
pnpm --dir front build
```

For route, auth, BFF, or full user-flow changes, also run:

```bash
pnpm --dir front test:e2e
```

If a check is skipped, report the exact command and reason in the final response.

## Test Co-location Convention

신규 단위 테스트는 source 파일과 동일 디렉토리에 co-locate 합니다.

- 새 파일: `features/host/ui/host-foo.tsx` → `features/host/ui/host-foo.test.tsx`
- 모듈 import: 동일 디렉토리이므로 `./host-foo` 로 import.
- vitest.config.ts 가 두 위치 모두 매치하도록 `include` 패턴이 `tests/unit/**` + `**/*.test.{ts,tsx}` 를 모두 커버.

기존 `front/tests/unit/` 테스트는 fixture 공유를 위해 이동하지 않습니다. 서버 testcontainer가 `readmates.frontend.fixtures.dir` system property로 해당 경로를 참조합니다.

신규 fixture가 서버에서 사용되는 경우에 한해 `tests/unit/__fixtures__/` 에 둡니다.
