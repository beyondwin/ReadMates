# ReadMates Admin vNext Audit Ledger

작성일: 2026-05-27
상태: APPROVED DESIGN SPEC

## 1. Context / Current State

Admin vNext는 이제 운영자가 상태를 감지하고 원인을 확인하고 조치하거나 지원하는 주요 흐름을 갖췄다.

- `/admin/health`는 7-card platform health snapshot을 제공한다.
- `/admin/notifications`는 outbox/delivery ledger와 two-step replay preview/confirm을 제공한다.
- `/admin/clubs/:clubId`는 클럽 운영 readiness, member/session aggregate, notification health, AI usage summary를 보여준다.
- `/admin/support`는 masked user search 기반 support grant 생성, active grant ledger, revoke 흐름을 제공한다.
- `/admin/ai-ops`는 AI job 운영 조회와 force-cancel 흐름을 제공한다.

현재 가장 큰 빈칸은 이 액션들의 결과를 한곳에서 설명하는 `/admin/audit`이다. 최근 S5/S4 구현은 이미 audit-ready metadata를 남기기 시작했지만, 운영자는 아직 UI에서 "누가, 언제, 어떤 권한으로, 무엇을 했고, 결과가 무엇이었는가"를 통합 조회할 수 없다.

이 spec은 사용자가 선택한 세 방향을 하나로 묶는다.

1. 통합 감사 ledger를 만든다.
2. S5/S4/S3/S6 감사 metadata 품질을 ledger에서 설명 가능한 형태로 보강한다.
3. `/admin/analytics`가 나중에 재사용할 기간/클럽/source/action filter foundation을 같이 고정한다.

Source documents:

- Current roadmap reset: `docs/superpowers/specs/2026-05-26-readmates-admin-vnext-operating-roadmap-reset-design.md`
- Operating console expansion: `docs/superpowers/specs/2026-05-27-readmates-admin-vnext-operating-console-expansion-design.md`
- Historical umbrella roadmap: `docs/superpowers/specs/2026-05-25-readmates-admin-vnext-roadmap-design.md`
- Architecture source of truth: `docs/development/architecture.md`
- Frontend guide: `docs/agents/front.md`
- Server guide: `docs/agents/server.md`
- Design guide: `docs/agents/design.md`
- Documentation guide: `docs/agents/docs.md`

## 2. Goal

`/admin/audit`의 목표는 새 운영 액션을 추가하는 것이 아니다. 기존 운영 액션의 설명 가능성을 제품화하는 것이다.

운영자는 `/admin/audit`에서 다음 질문에 답할 수 있어야 한다.

- 특정 클럽에 어떤 platform/admin/support/AI/notification 운영 이벤트가 있었는가?
- 특정 actor role이 어떤 액션을 수행했는가?
- notification replay, support grant, support revoke, club lifecycle, AI job action은 어떤 결과를 남겼는가?
- 문제가 생긴 뒤 SSH, DB shell, raw log 없이 제품 안에서 사건 순서를 확인할 수 있는가?

성공 기준은 route가 READY가 되는 것만이 아니다. 성공 기준은 `/admin/notifications`, `/admin/support`, `/admin/clubs/:clubId`, `/admin/ai-ops`에서 발생한 조치가 읽기 전용 운영 장부에 안전하게 연결되는 것이다.

## 3. Scope

### 3.1 통합 감사 Ledger

`/admin/audit`를 READY route로 전환하고, 기존 감사 source들을 하나의 cursor timeline으로 묶는다.

1차 source:

- `platform_audit_events`
  - support grant created/revoked
  - notification replay confirmed
  - platform-admin owned action records
- `club_audit_events`
  - club lifecycle and platform club state changes
- `ai_generation_audit_log`
  - AI generation attempt, retry, failure, commit/cancel related audit rows
- `admin_notification_replay_previews`
  - replay preview prepared/expired/consumed state summary where useful for explaining a later confirm action

The ledger is read-only. No mutation, replay, revoke, cancel, grant, or lifecycle action is introduced from `/admin/audit`.

### 3.2 감사 Metadata 품질 보강

The route must not dump raw `metadata_json`. Each source gets an allowlist projection that turns source-specific metadata into a small safe shape.

Required hardening:

- S5 replay audit must expose matched count, selection hash prefix, filter summary, reason presence, and consumed/confirmed state without raw recipient data.
- S4 support grant audit must expose grant id, club id, grantee masked label, scope, expiry bucket, and revoke state without raw email.
- S3 club operations should be explainable through existing club lifecycle/platform audit events. If a field is missing, ledger displays "세부 정보 없음" rather than raw JSON.
- S6 AI Ops audit must show provider/model/status/error code/cost/latency fields that are already PII-safe, and must never expose transcript, generated result JSON, prompt, or raw provider error.

Unknown or malformed metadata remains visible as an event shell with `metadataState = "unavailable"`. The UI should never render raw JSON as a fallback.

### 3.3 Analytics Foundation

This spec does not build `/admin/analytics`. It does define reusable filter primitives so S8 can reuse the same operator mental model.

Reusable concepts:

- `dateRange`: preset or explicit UTC date window
- `clubId`: optional platform club scope
- `sourceSlice`: S3, S4, S5, S6, platform, club
- `actionCategory`: notification, support, club_lifecycle, ai_ops, auth_security, platform_admin
- `actorRole`: OWNER, OPERATOR, SUPPORT, HOST, MEMBER, SYSTEM, UNKNOWN
- `outcome`: success, failed, denied, prepared, unknown

S8 analytics may later aggregate by these dimensions, but S7 only lists events and returns lightweight counts for the visible filter window.

## 4. Non-Goals

- Do not build `/admin/analytics` charts or KPI reports in this slice.
- Do not add mutation actions to `/admin/audit`.
- Do not create an arbitrary event bus or rewrite existing audit writes.
- Do not backfill historical records beyond what existing tables already contain.
- Do not expose raw `metadata_json`, raw email, full recipient list, SMTP/provider raw error, message body, transcript body, generated AI result JSON, private member notes, feedback document body, token, secret, private domain, deployment identifier, or internal hostname.
- Do not make `/admin/audit` a replacement for host-owned operational workflows.
- Do not publish raw Graphify output or local operational artifacts.

## 5. Architecture

### 5.1 Server Boundary

Add a read-only admin audit slice under a dedicated admin audit boundary:

```text
server/src/main/kotlin/com/readmates/admin/audit
  adapter/in/web
  adapter/out/persistence
  application/model
  application/port/in
  application/port/out
  application/service
```

The slice follows the server guide boundary:

```text
adapter.in.web -> application.port.in -> application.service -> application.port.out -> adapter.out.persistence
```

Responsibilities:

- Controller parses query params, current platform admin, cursor, and filter request.
- Application service authorizes read access, normalizes filters, calls source ports, merges source rows, and returns a cursor page.
- Persistence adapter reads existing audit tables and returns raw source records with only columns needed for projection.
- Source projectors convert raw source records into `AdminAuditLedgerItem`.
- Application service must not throw Spring Web/HTTP exceptions.

This is a read-side feature. It should be compatible with the repo's read-side architecture rules: no mutation outbound ports, no write adapters, no new operational side effects.

### 5.2 Source Reading Strategy

The implementation can use one of two equivalent persistence shapes, chosen during implementation after query-budget validation.

Preferred starting point:

- A single `JdbcAdminAuditLedgerAdapter` issues source-specific queries with common filter params, normalizes each source row to `AdminAuditSourceRow`, and lets the service merge/sort by `(occurredAt, sourceRank, sourceId)`.

Fallback if pagination becomes expensive:

- A SQL `union all` read projection returns common columns and source metadata blobs, then source projectors handle safe metadata.

Either shape must preserve stable cursor behavior. Cursor payload should include:

- `occurredAt`
- `source`
- `sourceId`

Cursor must be opaque in the API response and must reject malformed values with a safe validation error.

### 5.3 Frontend Boundary

Use the existing platform-admin route-first structure.

Expected files:

```text
front/features/platform-admin/api/platform-admin-audit-api.ts
front/features/platform-admin/model/platform-admin-audit-model.ts
front/features/platform-admin/queries/platform-admin-audit-queries.ts
front/features/platform-admin/route/admin-audit-data.ts
front/features/platform-admin/route/admin-audit-route.tsx
front/features/platform-admin/ui/admin-audit-ledger.tsx
```

Rules:

- API module owns BFF calls and request/response contracts.
- Model module owns filter normalization, source/outcome labels, metadata-to-view helpers, and URL state parsing.
- Query module owns query keys, loader seeding, cursor page reads, and focused invalidation if future actions link into the ledger.
- Route module owns URL state, loader factory, query seeding, and UI prop assembly.
- UI module renders from props and callbacks only.
- `admin-route-catalog.ts` flips `audit` from `coming_soon` to `ready`.
- `front/src/app/routes/admin.tsx` wires the new lazy route.

### 5.4 Docs And Release Notes

When implementation ships, update:

- `CHANGELOG.md`
- `docs/development/architecture.md`
- `docs/development/server-state-migration.md`

This design spec alone does not update those runtime docs because it is a planning artifact.

## 6. Server Data Contract

### 6.1 Request

`GET /api/admin/audit/events`

Query params:

- `from`: optional ISO timestamp, UTC-normalized
- `to`: optional ISO timestamp, UTC-normalized
- `range`: optional preset, one of `24h`, `7d`, `30d`, `90d`
- `clubId`: optional UUID
- `actorRole`: optional enum
- `sourceSlice`: optional enum
- `actionCategory`: optional enum
- `outcome`: optional enum
- `cursor`: optional opaque cursor
- `limit`: optional page size, bounded

Rules:

- If both `range` and explicit `from`/`to` are supplied, explicit `from`/`to` wins.
- If no range is supplied, default to `7d`.
- Maximum window is `90d` for this route.
- `limit` defaults to a small ledger-friendly value and is capped.
- Invalid filters return a typed safe error, not a stack trace.

### 6.2 Response

```json
{
  "generatedAt": "2026-05-27T00:00:00Z",
  "filters": {
    "from": "2026-05-20T00:00:00Z",
    "to": "2026-05-27T00:00:00Z",
    "clubId": null,
    "actorRole": null,
    "sourceSlice": null,
    "actionCategory": null,
    "outcome": null
  },
  "summary": {
    "visibleCount": 25,
    "sourceUnavailableCount": 0,
    "metadataUnavailableCount": 0
  },
  "items": [],
  "nextCursor": null
}
```

### 6.3 Item Shape

`AdminAuditLedgerItem`:

- `id`: stable composite id, not raw source id alone
- `occurredAt`: event timestamp
- `sourceSlice`: `S3`, `S4`, `S5`, `S6`, `platform`, `club`
- `sourceTable`: safe source identifier
- `actionCategory`: normalized category
- `actionType`: source action type, normalized where possible
- `outcome`: `success`, `failed`, `denied`, `prepared`, `unknown`
- `actor`
  - `userId`: optional UUID where role can view it
  - `role`: normalized role
  - `displayLabel`: safe label such as `OWNER`, `OPERATOR`, `SUPPORT`, `SYSTEM`, or masked user label
- `target`
  - `clubId`: optional UUID
  - `userId`: optional masked/role-gated UUID
  - `jobId`: optional UUID
  - `eventId`: optional UUID/string
  - `label`: safe target label
- `summary`: short operator-facing Korean summary
- `safeMetadata`: list of label/value/kind items
- `metadataState`: `available`, `empty`, `unavailable`

### 6.4 Source Mapping

`platform_audit_events`:

- S4 support grant create/revoke maps to `sourceSlice = "S4"`, `actionCategory = "support"`.
- S5 notification replay confirm maps to `sourceSlice = "S5"`, `actionCategory = "notification"`.
- Unknown platform event types map to `sourceSlice = "platform"`, `actionCategory = "platform_admin"`.

`club_audit_events`:

- Club status, lifecycle, domain, onboarding, or platform club events map to `sourceSlice = "S3"` when they explain club operations, otherwise `sourceSlice = "club"`.
- Metadata allowlist includes club id, lifecycle reason code, public visibility state, and event type.

`ai_generation_audit_log`:

- Maps to `sourceSlice = "S6"`, `actionCategory = "ai_ops"`.
- Safe metadata includes provider, model, status, error code, token counts, cost estimate, and latency.
- Transcript hash may be used only as a non-clickable technical fingerprint if needed; default UI should hide it.

`admin_notification_replay_previews`:

- Maps to `sourceSlice = "S5"`, `actionCategory = "notification"`, `outcome = "prepared"` or `unknown`.
- Safe metadata includes matched count, expiry state, consumed state, and selection hash prefix.
- Filter JSON is not displayed raw. It is summarized into safe fields such as status, channel, club scope, and created window when those fields are present.

## 7. Audit Metadata Quality Rules

All source-specific mappers must obey these rules.

- Allowlist output. Never pass through arbitrary metadata keys.
- Prefer safe labels over raw identifiers in the first row view.
- Keep raw UUIDs out of high-density rows unless they are already part of admin operational context.
- Mask user identity more strongly for SUPPORT than OWNER/OPERATOR when a direct user id is not needed for the audit question.
- Convert source-specific statuses into normalized `outcome`.
- If a source field is missing, render a missing-safe label rather than falling back to raw JSON.
- If JSON parsing fails, return `metadataState = "unavailable"` and keep the row visible.
- Treat provider errors, SMTP errors, and validation detail strings as unsafe unless an existing sanitizer or allowlist proves otherwise.

Minimum source quality gates:

- S5 replay confirm rows must show reason presence and count impact without showing recipients.
- S5 preview rows must show whether the preview expired or was consumed.
- S4 grant rows must show grant scope, expiry bucket, and target mask.
- S4 revoke rows must show revoked state and grant id without exposing private member profile fields.
- S6 rows must never expose transcript, prompt, generated JSON, or raw provider response.

## 8. UX

`/admin/audit` should feel like a precise operating ledger, not a generic dashboard.

### 8.1 Layout

Top area:

- page title: `감사`
- short status line with current time window and visible event count
- filter toolbar:
  - date range segmented control
  - club scope selector/search
  - source slice selector
  - action category selector
  - actor role selector
  - outcome selector

Main area:

- time-ordered ledger rows
- each row shows:
  - occurred time
  - actor role/label
  - action summary
  - target label
  - outcome chip
  - source slice chip
- load-more affordance for cursor pagination

Detail area:

- selected row detail panel on desktop
- stacked expandable detail on mobile
- safe metadata as label/value list
- source table label and event id for operator support, when safe
- "세부 정보 숨김" state for intentionally suppressed metadata

### 8.2 Empty And Partial States

Empty state:

- "선택한 조건에 해당하는 감사 이벤트가 없습니다."
- Keep filters visible.

Partial source unavailable:

- Page still renders available source rows.
- Summary strip shows which source group is unavailable.
- No route-level crash for a single source failure.

Malformed metadata:

- Row remains visible.
- Detail panel shows "세부 정보를 안전하게 표시할 수 없습니다."
- No raw JSON fallback.

### 8.3 Role Behavior

OWNER and OPERATOR:

- Can view all audit categories in the configured window.
- See operational ids needed for support and incident review.

SUPPORT:

- Can view ledger rows but receives stronger user masking.
- Cannot perform actions from audit.
- Should not see raw target user id unless an existing support grant or documented policy allows it.

Member/guest:

- No access.

## 9. Analytics Foundation

The filter and grouping model should be intentionally reusable for S8.

Shared names to preserve:

- `AdminTimeRange`
- `AdminDateWindow`
- `AdminSourceSlice`
- `AdminActionCategory`
- `AdminOutcome`
- `AdminActorRole`
- `AdminClubScope`

S7 usage:

- Fetch and display event rows.
- Show small visible-window counts only.

S8 future usage:

- Aggregate trends by the same `dateRange`, `clubId`, `sourceSlice`, `actionCategory`, and `outcome`.
- Reuse club scope and date window URL params.
- Reuse empty-state language for insufficient data.

This spec should not require S8 to use the same API endpoint. It only preserves naming and user-facing filter semantics so the admin review area remains coherent.

## 10. Error Handling

Server:

- Invalid filter or cursor returns a typed safe error.
- Authorization failure returns the existing platform admin auth error shape.
- Source query failures are represented as partial source state where practical.
- Metadata parse failures are item-local.
- No raw SQL, stack trace, JSON blob, provider response, SMTP response, token, or secret appears in the response.

Frontend:

- Route-level error boundary is reserved for total loader failures.
- Partial source failures render inside the page.
- Cursor expiry or invalid cursor resets to the first page with a safe message.
- Detail panel handles `metadataState` explicitly.
- Filter URL state is resilient to unknown enum values by dropping or defaulting them.

## 11. Testing And Verification Gates

### Server

Minimum server tests:

- `AdminAuditLedgerServiceTest`
  - merges source rows in reverse chronological order
  - normalizes outcomes
  - preserves cursor stability
  - handles source unavailable state
  - masks metadata by role
- Source projector tests
  - platform audit support grant create/revoke
  - platform audit notification replay confirm
  - club audit lifecycle event
  - AI generation audit row
  - notification replay preview row
  - malformed metadata
- Controller tests
  - OWNER/OPERATOR/SUPPORT access
  - member/guest denial
  - invalid filter rejection
  - cursor page shape

Minimum server commands:

```bash
./server/gradlew -p server unitTest --tests "com.readmates.admin.audit.application.service.AdminAuditLedgerServiceTest"
./server/gradlew -p server integrationTest --tests "com.readmates.admin.audit.api.PlatformAdminAuditControllerTest"
```

Run `architectureTest` if the new read-only package needs boundary coverage.

### Frontend

Minimum frontend tests:

- route catalog flips `audit` to READY
- route wiring lazy-loads `/admin/audit`
- loader seeds Query cache
- filter URL state normalizes defaults and invalid values
- ledger row renders actor/action/target/outcome/source
- detail panel renders safe metadata only
- empty state and partial source unavailable state render correctly

Minimum frontend commands:

```bash
pnpm --dir front exec vitest run features/platform-admin/model/admin-route-catalog.test.ts features/platform-admin/route/admin-audit-route.test.tsx features/platform-admin/ui/admin-audit-ledger.test.tsx
pnpm --dir front lint
pnpm --dir front test
pnpm --dir front build
```

### E2E

Minimum E2E:

```bash
pnpm --dir front exec playwright test tests/e2e/admin-audit.spec.ts --project=chromium
```

E2E should prove:

- dev-login OWNER can enter `/admin/audit`
- S5/S4 fixture rows are visible
- filter change updates the visible row set
- detail panel does not show raw JSON or raw private fields

### Docs And Public Safety

When implementation changes docs:

```bash
git diff --check -- CHANGELOG.md docs/development/architecture.md docs/development/server-state-migration.md
```

Before public release work:

```bash
./scripts/build-public-release-candidate.sh
./scripts/public-release-check.sh .tmp/public-release-candidate
```

Targeted safety scan should check changed fixtures, docs, and E2E data for:

- raw email bodies
- unmasked recipient lists
- provider raw errors
- transcript/result JSON
- token-shaped values
- local absolute paths
- private domains

## 12. Implementation Phases

### Phase 1: Contract And Backend Projection

- Add admin audit application models and use case.
- Add source row/projector layer.
- Add persistence read adapter for existing audit tables.
- Add controller and safe filter/cursor parsing.
- Add server tests for projection, masking, filters, and permissions.

Gate:

- `/api/admin/audit/events` returns a stable cursor page for seeded existing audit rows.
- Raw metadata never leaks in controller responses.

### Phase 2: Frontend READY Route

- Add platform-admin audit API/model/query/route/ui modules.
- Flip `audit` route to READY.
- Add route wiring.
- Add filter URL state and cursor load-more.
- Add row/detail UI and partial states.

Gate:

- `/admin/audit` is reachable in the admin shell.
- Ledger rows and detail panel render from safe metadata only.
- The coming-soon pill is gone for audit.

### Phase 3: Metadata Quality Hardening

- Review existing S5/S4/S3/S6 audit writes against the allowlist mappers.
- Add or adjust audit metadata fields only where required for safe explanation.
- Prefer additive metadata changes over changing existing action semantics.
- Add regression tests for the fields the ledger depends on.

Gate:

- Notification replay, support grant/revoke, club lifecycle, and AI audit rows all produce useful summaries.
- Missing legacy metadata remains safe and readable.

### Phase 4: Analytics Compatibility And Release Docs

- Extract shared frontend model names if they are already useful for future S8.
- Document the `/admin/audit` route in architecture and server-state migration docs.
- Add CHANGELOG entry.
- Run integrated checks and public-safety scan.

Gate:

- S8 can reuse the filter vocabulary without renaming the shipped `/admin/audit` URL/query model.

## 13. Risks And Mitigations

| Risk | Mitigation |
| --- | --- |
| Raw metadata leaks into UI | Source-specific allowlist mappers and response-shape tests |
| Event source schemas differ too much | Normalize only common fields; show safe metadata lists for source-specific detail |
| Cursor pagination across multiple tables becomes unstable | Opaque cursor includes occurredAt/source/sourceId; integration tests pin page boundaries |
| S7 blocks on perfect historical backfill | Ship with existing rows and safe missing metadata states |
| SUPPORT sees too much identity data | Role-aware projection and UI tests for stronger SUPPORT masking |
| `/admin/audit` becomes an action surface | Explicit read-only route, no mutation hooks, no action buttons |
| S8 needs different filters later | Preserve common filter names but do not force shared endpoint or chart contract now |
| Query performance regresses on large audit tables | Start with bounded 90-day window, limit cap, and add indexes only if query-plan tests prove the need |

## 14. Plan Handoff

After this spec is reviewed, write one implementation plan for S7 `/admin/audit`.

The plan should keep task boundaries explicit:

1. backend audit projection and controller;
2. frontend route/API/query/UI;
3. metadata hardening for existing S5/S4/S3/S6 audit writes;
4. docs, verification, and public-safety closeout.

Do not include `/admin/analytics` implementation in the S7 plan. Only preserve the shared filter vocabulary and URL semantics needed for the later S8 slice.
