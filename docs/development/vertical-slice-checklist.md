# Vertical Slice Checklist

Use this checklist when a change crosses frontend, BFF, server API, auth, persistence, or public-safety boundaries.

## 0. Handoff

- Requirement마다 구현 task와 acceptance evidence가 연결되어 있습니다.
- Task dependency와 예상 수정 파일이 명시되어 있습니다.
- Parallel task는 같은 파일, database, container, fixture directory, build output을 공유하지 않습니다.
- Executor-specific state, 개인 경로, model/auth/MCP 설정이 제품 계약에 포함되지 않습니다.
- Non-goal, skipped validation, deploy 이후 operator follow-up이 구분되어 있습니다.

## 1. Surface

- Product surface is one of public, member, host, platform admin, auth, BFF, or operations.
- The owning feature folder is named before code changes start.
- The change does not introduce real member data, secrets, private domains, deployment state, local paths, OCIDs, or token-shaped examples.

## 2. Server

- Controller parses HTTP input and maps responses only.
- Application service owns authorization, lifecycle rules, orchestration, and application errors.
- Persistence, Redis, Kafka, mail, provider SDK, and HTTP client details are behind outbound ports/adapters.
- Read-side services use `@ReadOnlyApplicationService` and do not depend on mutation ports.
- Workflow-side services keep side effects behind ports and document retry or recovery behavior in tests.

## 3. BFF / Auth

- Browser traffic uses same-origin `/api/bff/**` when the frontend calls Spring API.
- Internal `x-readmates-*` response headers and secrets are stripped.
- Club context is derived from trusted BFF input, not browser-supplied internal headers.
- Route return values and redirects use safe relative paths unless an allowlisted absolute return flow is explicitly documented.

## 4. Frontend

- `api` owns BFF calls and response contracts.
- `queries` owns query keys, `queryOptions`, mutation hooks, and invalidation.
- `model` owns pure view-model calculation and imports no React, router, query, or API client.
- `route` owns loader/action behavior, auth/redirect, URL state, query seeding, and UI prop assembly.
- `ui` renders from props/callbacks and imports no API, query, route, or `shared/api` client.

## 5. Tests

- Server boundary change: run `./server/gradlew -p server architectureTest`.
- Server behavior change: run the focused unit or integration test for the slice.
- Frontend boundary change: run `pnpm --dir front exec vitest run tests/unit/frontend-boundaries.test.ts`.
- Frontend behavior change: run the focused Vitest file and the smallest relevant route/component test.
- API, auth, BFF, or user-flow change: run `pnpm --dir front test:e2e`.
- Public release change: run `./scripts/build-public-release-candidate.sh` and `./scripts/public-release-check.sh .tmp/public-release-candidate`.
