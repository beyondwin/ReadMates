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
- `shared`: reusable primitives; do not import feature/page/app code except documented legacy exceptions.
- `functions`: Cloudflare Pages Functions for same-origin BFF and OAuth proxy routes; never expose BFF secrets through `VITE_*`.

Do not add new imports from removed `shared/api/readmates`. Use feature-owned API modules or `shared/api` primitives.

When touching a migrated feature, prefer `api`, `model`, `route`, `ui` placement over adding to legacy `components`.

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

Done when the touched route or component follows the dependency direction, relevant unit/build/E2E checks are run or explicitly reported as skipped, and any user-visible flow changed by the patch has been exercised by test or manual inspection.
