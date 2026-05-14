# Frontend Agent Guide

Read this for work under `front/`.

The frontend is a Vite React SPA with React Router 7 and Cloudflare Pages Functions for BFF/OAuth proxy routes.

Successful frontend changes keep route modules in charge of data flow, keep UI components prop/callback driven, and avoid leaking server-only configuration into the browser bundle.

Physical source roots under `front/`:

```text
src/app
src/pages
features
shared
functions
```

The `@/*` alias resolves to `front/*`.

Follow the route-first dependency direction:

```text
src/app -> src/pages -> features -> shared
```

- `src/app`: router, layouts, guards, providers, route continuity.
- `src/pages`: thin route compatibility shells; delegate to feature route modules.
- `features/<name>/api`: BFF calls and request/response contracts.
- `features/<name>/model`: pure calculation/mapping; no React, router, fetch, or API client imports.
- `features/<name>/route`: loader/action behavior, API/model calls, route state, UI prop assembly.
- `features/<name>/ui`: render from props/callbacks only; no `fetch`, `shared/api`, feature API, or route imports.
- `shared`: reusable primitives; do not import feature/page/app code.
- `functions`: Cloudflare Pages Functions for same-origin BFF and OAuth proxy routes; never expose BFF secrets through `VITE_*`.

Do not add new imports from removed `shared/api/readmates`. Use feature-owned API modules or `shared/api` primitives.

Do not add Next/React Server Component directives such as `"use client"` to Vite source files.

Server state는 TanStack Query v5로 점진 이관 중입니다. 앱 루트(`front/src/main.tsx`)에 단일 `QueryClient`를 주입하고, `front/src/app/router.tsx`의 `createReadmatesRouter()`가 `{router, queryClient}`를 반환해 loader와 컴포넌트가 같은 cache를 공유합니다. 새 server state는 `features/<name>/queries/<area>-queries.ts`에 `queryOptions` + `useXxxMutation`을 두고, mutation은 `onSuccess`에서 `invalidateQueries({ queryKey: keys.all })`로 정리합니다. 진행 상황은 [docs/development/server-state-migration.md](../development/server-state-migration.md)를 참고합니다.

`front/src/app/router.tsx`는 composition root입니다. Route 정의는 `front/src/app/routes/{public,auth,member,host}.tsx`에 variant별로 분리되어 있으니, 새 route는 해당 variant 모듈에 추가합니다.

신규 단위 테스트는 source 옆에 `*.test.{ts,tsx}`로 co-locate합니다(`front/AGENTS.md` 참조). 기존 `front/tests/unit/`는 server testcontainer fixture 공유를 위해 이동하지 않습니다.

When validating club slugs in browser proxy or Pages Functions code, reuse `front/shared/security/club-slug.ts` so local Vite and Cloudflare behavior stay aligned.

When touching a migrated feature, prefer `api`, `model`, `route`, `ui` placement over adding to legacy `components`. If a feature has `ui`, that directory is the public presentation surface; do not expose `components` as a new public import surface.

Read another guide when the frontend task crosses surfaces:

- UI, layout, copy, or visual polish: `docs/agents/design.md`.
- Backend API contract, authorization, persistence, or migration changes: `docs/agents/server.md`.
- README, deploy docs, scripts docs, or agent instructions: `docs/agents/docs.md`.

Ask before editing if the route, API contract, or auth boundary cannot be inferred from current code and docs. Stop and report if a proposed change would require browser-exposed secrets or real member/deployment data.

Checks:

```bash
pnpm --dir front lint
pnpm --dir front test
pnpm --dir front build
```

For route/auth/BFF/user-flow changes, also run:

```bash
pnpm --dir front test:e2e
```

Coverage 변동이 우려되는 변경(테스트 삭제, 큰 reducer 추가 등)에서는 로컬 게이트도 함께 확인합니다. CI front job은 이 명령으로 게이트를 강제합니다.

```bash
pnpm --dir front test:coverage
```

Done when the touched route or component follows the dependency direction, relevant unit/build/E2E checks are run or explicitly reported as skipped, and any user-visible flow changed by the patch has been exercised by test or manual inspection.
