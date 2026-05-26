# ReadMates Admin vNext Operating Roadmap Reset

작성일: 2026-05-26
상태: APPROVED DESIGN SPEC

## 1. 배경

기존 Admin vNext umbrella roadmap은 `/admin`을 10개 slice로 나누는 큰 방향을 정했다. 이후 S1 Admin IA Foundation과 S2 Platform Ops Health가 실제 코드로 들어오면서 현재 상황이 달라졌다. `/admin/health`는 이제 READY route이고, `/api/admin/health/snapshot`도 존재한다. 따라서 다음 작업은 기존 순서를 기계적으로 이어 가는 것이 아니라, 현재 코드 기준으로 운영자가 매일 쓰는 흐름을 다시 고정하는 것이다.

이 문서는 기존 roadmap을 삭제하거나 덮어쓰지 않는다. 기존 `2026-05-25-readmates-admin-vnext-roadmap-design.md`는 historical parent roadmap으로 유지하고, 이 문서는 현재 코드 기준의 실행용 재정렬 문서로 둔다.

성공 기준은 "화면 수가 늘었다"가 아니다. `/admin`이 운영자가 문제를 감지하고, 원인을 확인하고, 조치하거나 지원하고, 그 기록을 감사/리포트로 확인하는 실제 운영 대장부처럼 느껴지는 것이다.

## 2. Source Documents

- Parent roadmap: `docs/superpowers/specs/2026-05-25-readmates-admin-vnext-roadmap-design.md`
- S2 design record: `docs/superpowers/specs/2026-05-26-readmates-admin-vnext-s2-platform-ops-health-design.md`
- Current architecture source of truth: `docs/development/architecture.md`
- Frontend guide: `docs/agents/front.md`
- Server guide: `docs/agents/server.md`
- Design guide: `docs/agents/design.md`
- Docs guide: `docs/agents/docs.md`

## 3. Current Code Audit

Current code already contains the S2 health route and snapshot API:

- `front/src/app/routes/admin.tsx` wires `/admin/health` as a ready lazy route.
- `front/features/platform-admin/model/admin-route-catalog.ts` marks `health` as `ready`.
- `front/features/platform-admin/route/admin-health-route.tsx` renders the Platform Health surface.
- `front/features/platform-admin/api/platform-admin-health-api.ts` fetches `/api/admin/health/snapshot`.
- `server/src/main/kotlin/com/readmates/admin/health/adapter/in/web/PlatformAdminHealthController.kt` exposes the snapshot endpoint.
- `server/src/main/kotlin/com/readmates/admin/health/application/service/PlatformAdminHealthService.kt` composes health cards.
- `CHANGELOG.md` and `docs/operations/observability/README.md` already mention `/admin/health`.

S2 is not fully closed as a product slice yet. Current hardening gaps:

- The server response uses camelCase fields such as `generatedAt`, `lastCheckedAt`, and `deployStrip`, while the frontend health model and tests expect snake_case fields such as `generated_at`, `last_checked_at`, and `deploy_strip`.
- Health UI components define many `admin-health-*` class names, but the CSS surface is not product-grade yet.
- The S2 spec promised a refresh control and a 7-card happy path; current tests do not fully pin that behavior.
- Browser-level smoke has not yet proven that dev-login reaches a polished `/admin/health` page with real or mocked cards.
- `PlatformAdminHealthService` computes providers sequentially, while the S2 design intended isolated provider failures and low-latency refresh behavior.
- Some provider semantics are still first-pass operational signals. For example, Redis currently reads a boot-lifetime error counter rather than a recent-window signal.

These gaps make S2 hardening the first required gate before opening the next product slice.

## 4. Operating Flow

The new roadmap is ordered by the operator's workflow:

```text
상태 감지
→ 원인 확인
→ 조치 또는 지원
→ 기록/감사
→ 리포트/분석
```

This means the order changes from the historical catalog order. A route becomes valuable only when the operator can follow the next step from that route. For example, `/admin/health` can show an outbox backlog problem, but the product is incomplete if the outbox card drills into a placeholder instead of a real cause-and-action view.

## 5. Reset Slice Order

### S2H — `/admin/health` Hardening

Purpose: close the already-shipped health route to product quality.

Scope:

- Align frontend and server response naming around the current ReadMates convention. New frontend health types should match actual server JSON.
- Add contract tests that prevent camelCase/snake_case drift.
- Add complete 7-card fixture coverage, including deploy strip rendering.
- Add manual refresh and stale snapshot affordance.
- Add product-grade `admin-health-*` CSS that matches the calm operating-ledger tone of the existing admin shell.
- Verify desktop and mobile layouts.
- Run a dev-login browser smoke for `/admin/health`.

Non-goals:

- Do not add Grafana, Alertmanager webhooks, historic charts, or provider probe actions.
- Do not add new health card categories beyond the S2 seven-card contract.
- Do not expose provider raw errors, private deployment paths, secrets, or real operational ledger contents in docs or fixtures.

Gate:

- `/admin/health` is visually complete enough to use as the first operating entry point.
- The API shape is pinned by server and frontend tests.
- The page shows all seven card slots correctly when fed a complete fixture.
- The deploy strip renders from actual API field names.
- Browser smoke confirms no obvious broken text, missing timestamps, or unstyled card layout.

### S5 — Notification / Outbox Operations

Purpose: make the first health drill-down actionable.

Why it moves before S3:

S2 health already has outbox backlog and notification dispatch success cards. Those cards drill toward `/admin/notifications`. If `/admin/notifications` stays coming-soon, the operator can detect a problem but cannot inspect or act on it. That breaks the operating flow.

Scope:

- Flip `/admin/notifications` to READY.
- Show outbox backlog, relay status, dead letter rows, failure clusters, recent automatic/manual notification events, and club-level delivery health.
- Add replay workflow with dry-run preview followed by explicit confirm.
- Keep replay/action contracts audit-ready even if the unified audit route ships later.

Non-goals:

- Do not expose full email body, provider raw error, SMTP detail, raw recipient lists, or private member data.
- Do not add Alertmanager automation or an external incident tool.
- Do not change notification state machine semantics unless a separate implementation plan proves the need.

Gate:

- A red outbox or notification card on `/admin/health` can lead to `/admin/notifications` where the operator sees the likely cause.
- Replay cannot run without dry-run, permission checks, validation, and an audit-ready action record.
- OWNER/OPERATOR/SUPPORT affordances are explicit and consistent with server authorization.

### S3 — Club Operations Console

Purpose: deepen `/admin/clubs/:id` into the per-club operating view.

Scope:

- Add an admin club operations snapshot for member activity, session progress, publication readiness, notification health, and AI usage/cost summary.
- Reuse S5 notification signals where club-level notification health is needed.
- Keep the surface read-mostly. Platform admin should diagnose and coordinate, not replace host workflows.

Non-goals:

- Do not move host session editing, attendance, member lifecycle commands, notes, or club-internal operations into `/admin`.
- Do not reveal member private details by default.
- Do not make this a generic CRM screen.

Gate:

- `/admin/clubs/:id` answers "what is happening with this club and where should I go next?"
- The server contract is stable enough for future S8 analytics and S9 host-surface reuse.
- The UI distinguishes platform-owned metadata/readiness from host-owned club operations.

### S4 — Support Workbench And Member Search

Purpose: replace raw UUID support grant flow with a safe operator workflow.

Scope:

- Add email/name/UUID search.
- Show safe member and platform-admin lookup results.
- Create support grants from a resolved result instead of raw UUID input.
- Show grant revoke, reason, expiry, and history ledger.
- Validate active platform admin grantee, future expiry, max duration, non-blank reason, and role permission.

Non-goals:

- Do not create a general member management console.
- Do not allow support access to become a host workflow replacement.
- Do not show private member data beyond the support purpose and role.

Gate:

- Grant creation without a successful lookup is impossible.
- SUPPORT can read only what the role permits and cannot perform destructive actions.
- Failed grant/revoke actions produce visible, safe explanations.

### S7 — Audit / Activity Ledger

Purpose: unify the records generated by prior operating actions.

Scope:

- Read-only integrated ledger for platform admin actions, support grants, outbox replay actions, club lifecycle operations, and role transitions.
- Actor, club, role, action, outcome, and source-slice filters.
- Masking policy is consistent with the originating slice.

Non-goals:

- No new mutation path.
- No raw secret, provider raw error, private message body, or unmasked recipient bulk export.

Gate:

- Every displayed audit item has a source slice and safe action description.
- The ledger can explain what happened after S5/S3/S4 actions without requiring log access.

### S8 — Analytics / Reporting Lite

Purpose: summarize trends after the daily operating surfaces are useful.

Scope:

- 7/30/90-day club KPI trends.
- Active member, session completion, RSVP, AI cost/session, notification delivery signals.
- Cross-club benchmark where data is sufficient.
- Honest "not enough data" states when data is thin.

Non-goals:

- No real-time streaming dashboard.
- No arbitrary mock chart for empty data.
- No public exposure of live operational metrics.

Gate:

- The analytics route is useful with local fixture/dev seed data.
- Empty states are honest and do not imply missing product quality.
- Data contracts reuse S3/S5 where appropriate.

### Re-evaluate S6 / S9 / S10

S6 AI Ops depth, S9 host-surface reinforcement, and S10 public portfolio polish should be re-evaluated after S4 or S5 depending on product need.

Current default:

- S6 is not first because AI Ops already has a READY surface.
- S9 should wait for S3 contracts so host and admin surfaces do not diverge.
- S10 should wait until sanitized operational evidence exists.

## 6. Architecture Principles

Frontend:

- Route modules own loader behavior, URL state, query seeding, and UI prop assembly.
- Feature API contracts live under `front/features/platform-admin/api`.
- Pure calculation and response normalization live under `front/features/platform-admin/model`.
- UI modules render from props and callbacks. They must not fetch or import route modules.
- `admin-route-catalog.ts` and `platform-admin-permissions.ts` remain the shell source of truth.
- READY route additions should stay lazy-split through `front/src/app/routes/admin.tsx`.

Server:

- New admin read/ops functionality follows feature-local clean architecture.
- Controllers own HTTP parsing and response mapping only.
- Application services own authorization, orchestration, and business rules.
- Prometheus, ledger files, persistence, mail, and Kafka details stay behind outbound ports/adapters.
- Application services do not throw Spring web/http exceptions.
- Any admin write action must be audit-ready from the slice where it is introduced.

Public-safety:

- No real member data, secrets, private domains, deployment state, local absolute paths, OCIDs, token-shaped examples, provider raw errors, transcript bodies, generated AI result JSON, or private message bodies in docs, fixtures, logs, or UI examples.
- Use placeholders and sanitized fixtures only.

## 7. Slice Template

Every follow-up slice spec should use the same section structure:

```text
Purpose
Current code state
Scope
Non-goals
Primary files and packages
API/data contract
Permissions and public safety
Testing and verification gates
Dependency on previous/next slices
```

The implementation plan created after this roadmap reset should target S2H first. Later slices get their own spec and plan rather than a single giant plan for S5 through S8.

## 8. Verification And Release Safety

Common gates:

- Contract: server DTOs, frontend types, fixtures, and E2E mocks use the same field names and shape.
- Authorization: OWNER, OPERATOR, SUPPORT, member, and guest behavior is documented per slice.
- Public safety: no private operational or member data leaks through examples, responses, UI, or docs.
- UI verification: each new READY route gets at least one Playwright happy path and browser smoke or screenshot QA.
- Release readiness: CHANGELOG `Unreleased` and related operation docs are updated when behavior changes.
- Regression checks:
  - Frontend: `pnpm --dir front lint`, `pnpm --dir front test`, `pnpm --dir front build`.
  - Server: `./server/gradlew -p server unitTest`, plus `architectureTest` when boundaries move.
  - Auth/BFF/user-flow routes: `pnpm --dir front test:e2e`.
  - Public release impact: public release candidate checks.

S2H minimum checks:

- Targeted frontend tests for health contracts, route, grid/card, deploy strip, and route catalog.
- Targeted server unit tests for controller serialization and health service/provider behavior.
- Playwright `/admin/health` happy path with seven cards and deploy strip.
- Browser smoke with dev platform admin login.
- `git diff --check` for changed docs and source.

S5 minimum checks:

- Service tests for outbox filters, dry-run replay, confirm replay, failure clustering, and permission denial.
- Controller tests for masked responses and unsafe request rejection.
- Frontend tests for replay disabled/enabled states and safe failure copy.
- E2E from `/admin/health` outbox card to `/admin/notifications`.

S3 minimum checks:

- Contract tests for `AdminClubOperationsSnapshot`.
- Frontend route tests for selected club, empty club, permission, and loading/error states.
- E2E for a club detail operations snapshot.

S4 minimum checks:

- Lookup and grant validation tests for every application rule.
- UI tests proving raw UUID-only grant flow is gone.
- E2E for search → grant → revoke with safe errors.

## 9. Documentation Rules

- Keep existing historical planning notes intact.
- New current execution docs should link to historical specs instead of rewriting them.
- CHANGELOG entries should describe shipped behavior, not internal plan language.
- Operational docs should be updated only when the operator procedure changes.
- Public-facing docs must use placeholders and avoid private operational details.

## 10. Risks

| Risk | Where it appears | Mitigation |
| --- | --- | --- |
| S2 looks shipped but has contract/UI drift | S2H | Make S2H the first gate and pin API shape in tests |
| Health detects problems that still drill into placeholders | S5 | Move notification/outbox before club console |
| Club console becomes a host app duplicate | S3 | Keep admin read-mostly and preserve host-owned commands |
| Support search leaks member data | S4 | Mask by default and tie reveal/grant to role and purpose |
| Audit arrives too late to record prior actions | S5/S4 before S7 | Make action records audit-ready in their originating slice |
| Analytics is empty or artificial | S8 | Require fixture/dev data and honest empty states |
| Cross-surface contracts create import cycles | S3/S9 | Choose a neutral contract owner before host reuse |
| Public repo safety regresses through docs/examples | All slices | Run targeted public-safety scans for changed files |

## 11. Next Step

After this spec is reviewed, create the implementation plan for **S2H `/admin/health` Hardening** only. That plan should not attempt to implement S5 through S8. The roadmap reset is the sequencing source; each later slice needs its own spec and implementation plan when it becomes current.
