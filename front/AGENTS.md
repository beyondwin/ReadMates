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
- vitest.config.ts 의 node/jsdom 프로젝트 `include` 는 `tests/unit/**` 와 `src|features|shared/**/*.test.{ts,tsx}` 를 커버. co-location 은 이 세 루트(`src/`, `features/`, `shared/`)에서만 동작하며, `functions/` 등 다른 디렉토리에 co-locate 한 테스트는 실행되지 않으므로 해당 테스트는 `tests/unit/` 에 둔다.

기존 `front/tests/unit/` 테스트는 fixture 공유를 위해 이동하지 않습니다. 서버 testcontainer가 `readmates.frontend.fixtures.dir` system property로 해당 경로를 참조합니다.

신규 fixture가 서버에서 사용되는 경우에 한해 `tests/unit/__fixtures__/` 에 둡니다.
