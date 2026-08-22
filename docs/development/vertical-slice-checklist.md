# Vertical Slice Checklist

Use this checklist when a change crosses frontend, BFF, server API, auth, persistence, or public-safety boundaries.

## 0. Handoff

- ADR impact가 `none`, `update`, `new`, `supersede` 중 하나로 기록되어 있습니다.
- 표면 수와 무관한 durable product·technical·design·operational decision은 구현 전에 한 결정당 한 `Proposed` ADR로 분리되어 있고, 관련 accepted ADR과 충돌하지 않습니다.
- `Proposed → Accepted` 조건에 코드, 테스트, active architecture 동기화가 연결되어 있습니다.
- Requirement마다 구현 task와 acceptance evidence가 연결되어 있습니다.
- `acceptance-matrix.md`에서 선택한 row와 이유, 인접한 high-risk row를 제외한 이유가 기록되어 있습니다.
- Task dependency와 예상 수정 파일이 명시되어 있습니다.
- Parallel task는 같은 파일, database, container, fixture directory, build output을 공유하지 않습니다.
- Executor-specific state, 개인 경로, model/auth/MCP 설정이 제품 계약에 포함되지 않습니다.
- Non-goal, skipped validation, deploy 이후 operator follow-up이 구분되어 있습니다.
- local runtime 작업은 기존 service, worktree, container, port, cache를 보존하고 시작 전에 isolation 방식을 선택합니다.

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

## 6. Decision Closeout

- 구현된 결정만 `Accepted`이고 아직 계획/설계 단계인 결정은 `Proposed`로 남아 있습니다.
- 새 결정이 기존 결정을 바꾸면 기존 ADR은 삭제하지 않고 `Superseded by ADR-NNNN`으로 연결되어 있습니다.
- `docs/development/adr/README.md`, `docs/development/technical-decisions.md`, `docs/development/architecture.md`가 delivered contract와 일치합니다.
- 최종 handoff가 ADR 영향과 남은 `Proposed` ADR을 명시합니다.
