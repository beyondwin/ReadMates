# ReadMates Admin vNext Operating Console Expansion

작성일: 2026-05-27
상태: APPROVED DESIGN SPEC

## 1. Context / Current State

`/admin/health` is now the first product-grade admin operating entry point. It exposes a seven-card platform health snapshot and drills outbox and notification cards toward `/admin/notifications`. The current gap is the next operating step: an operator can detect outbox or notification risk, but `/admin/notifications` is still a coming-soon route.

The current admin route catalog also has two other partially mature surfaces:

- `/admin/clubs/:id` exists, but it is still a lightweight club metadata detail route rather than a per-club operating console.
- `/admin/support` exists, but it only directs operators to the club detail support tab. The existing support grant panel still depends on raw `granteeUserId` input in the selected-club context.

This spec expands the admin operating console across those three surfaces in one product design. It does not replace the existing S1/S2 roadmap records. It turns the next operating run into one cohesive spec with independent phase gates.

Source documents:

- Current roadmap reset: `docs/superpowers/specs/2026-05-26-readmates-admin-vnext-operating-roadmap-reset-design.md`
- Historical umbrella roadmap: `docs/superpowers/specs/2026-05-25-readmates-admin-vnext-roadmap-design.md`
- Platform admin productization design: `docs/superpowers/specs/2026-05-20-readmates-platform-admin-productization-design.md`
- Architecture source of truth: `docs/development/architecture.md`
- Frontend guide: `docs/agents/front.md`
- Server guide: `docs/agents/server.md`
- Design guide: `docs/agents/design.md`
- Documentation guide: `docs/agents/docs.md`

## 2. Unified Goal

The goal is to make `/admin` feel like a real operating console after health detection:

```text
상태 감지
→ 원인 확인
→ 조치 또는 지원
→ 기록 준비
```

The operator should be able to:

- follow a red `/admin/health` outbox or notification card into an actionable route;
- inspect notification and outbox failure shape without seeing private message content;
- inspect a club's operational health without entering host-owned workflows;
- resolve a support target before granting temporary support access;
- leave action records that a later audit ledger can consume.

Success is not measured by adding route count. Success means the admin surfaces answer the operator's next question without SSH, database inspection, or unsafe raw identifiers.

## 3. Phase Order

This is one design spec with three independent implementation phases.

### Phase 1: S5 Notification / Outbox Operations

Do this first. `/admin/health` already drills to `/admin/notifications`, so leaving that route as a placeholder breaks the operating flow.

Phase 1 flips `/admin/notifications` to READY and adds an admin notification operations view backed by admin-scoped notification/outbox read models and replay actions.

### Phase 2: S3 Club Operations Console

Do this second. The club operations route should reuse notification health concepts from Phase 1 when presenting club-level delivery health.

Phase 2 deepens `/admin/clubs/:id` into a read-mostly per-club operating view. It remains platform-admin owned and does not absorb host session or member management commands.

### Phase 3: S4 Support Workbench

Do this third. Support grants are already present, but the operator experience is still raw-id oriented.

Phase 3 replaces the light `/admin/support` shell with a searchable support workbench. Grant creation requires selecting a resolved safe result and passing application validation.

Each phase can ship separately with its own tests and CHANGELOG entry. Later implementation plans should keep this ordering unless current code proves a dependency has changed.

## 4. Architecture

### Frontend Boundary

Keep the existing route-first dependency direction:

```text
front/src/app -> front/src/pages -> front/features -> front/shared
```

All new admin work stays under `front/features/platform-admin` and follows the existing feature layout:

```text
features/platform-admin/api
features/platform-admin/model
features/platform-admin/queries
features/platform-admin/route
features/platform-admin/ui
```

Rules:

- Route modules own loader behavior, URL state, Query seeding, mutation coordination, and UI prop assembly.
- API modules own BFF calls and request/response contracts.
- Model modules own pure calculations and response-to-view transformations.
- UI modules render from props and callbacks only.
- READY route toggles stay in `front/features/platform-admin/model/admin-route-catalog.ts`.
- Lazy route wiring stays in `front/src/app/routes/admin.tsx`.

Expected frontend surfaces:

- `platform-admin-notifications-*` modules for `/admin/notifications`.
- `platform-admin-club-operations-*` modules for the operations snapshot behind `/admin/clubs/:id`.
- `platform-admin-support-*` modules for `/admin/support`.

Shared widgets may be extracted only when a real cross-surface contract appears, such as masked identity chips, status chips, cursor ledgers, or audit-ready action summaries.

### Server Boundary

Do not create a generic admin monolith package for all three phases. Keep domain ownership clear.

- Notification/outbox admin operations live in the existing `notification` feature with admin inbound adapters, application ports, application services, and outbound persistence adapters where needed.
- Club operations snapshot uses a feature-local read aggregation. It may coordinate existing club, notification, session, and AI read models, but it must not move host-owned commands into admin.
- Support search and grant validation build on the existing support grant flow in the `club` feature and platform admin authorization model.

Application services must not throw Spring Web/HTTP types. Controllers map request/response shape only. Persistence stays behind outbound ports/adapters. Any admin write action introduced here must be audit-ready from its originating phase, even before `/admin/audit` ships.

### Cross-Surface Data Ownership

- S5 owns admin notification/outbox operation contracts.
- S3 owns `AdminClubOperationsSnapshot` and the KPI field naming that S8/S9 can later reuse.
- S4 owns support search, support grant ledger, and support action metadata contracts.
- S7 audit will later consume action records from S5 and S4 rather than retrofitting them.

## 5. Phase 1: S5 Notification / Outbox Operations

### Purpose

Make the first health drill-down actionable. If `/admin/health` reports an outbox backlog, failed notification dispatch, or dead delivery risk, `/admin/notifications` should show the likely cause and safe next action.

### Route UX

`/admin/notifications` becomes a READY route with:

- top summary strip for pending, failed, dead, publishing/sending, and recent success signals;
- tabs or segmented filters for outbox events, channel deliveries, failure clusters, manual dispatch audit, and club health;
- incoming drill-down context from `/admin/health`, such as `?focus=outbox_backlog` or `?focus=notification_dispatch_success`;
- cursor-based ledgers for large lists;
- dry-run replay preview panel;
- confirm replay panel with explicit reason and impact summary.

The page should be dense and factual. It should not look like a marketing dashboard and should not over-explain normal UI behavior.

### Data Contract

Introduce admin-scoped response types around the existing notification pipeline:

- `AdminNotificationOperationsSnapshot`
  - `generatedAt`
  - `outboxSummary`
  - `deliverySummary`
  - `relaySummary`
  - `failureClusters`
  - `clubHealth`
  - `recentManualDispatches`
- `AdminNotificationOutboxEvent`
  - `eventId`
  - `club`
  - `eventType`
  - `source`
  - `status`
  - `attemptCount`
  - `nextAttemptAt`
  - `createdAt`
  - `updatedAt`
  - `safeErrorCode`
  - `manualDispatch`
- `AdminNotificationDelivery`
  - `deliveryId`
  - `eventId`
  - `club`
  - `channel`
  - `status`
  - `maskedRecipient`
  - `attemptCount`
  - `createdAt`
  - `updatedAt`
  - `safeErrorCode`
- `AdminNotificationReplayPreview`
  - `previewId`
  - `selectionHash`
  - `matchedCount`
  - `excludedCount`
  - `estimatedByStatus`
  - `warnings`
  - `expiresAt`

Use cursor page shape for ledgers: `{ "items": [...], "nextCursor": string | null }`.

### Actions

Replay must be two-step:

1. `POST /api/admin/notifications/replay-preview`
   - validates filters, role, and replayable statuses;
   - returns a short-lived preview id and selection hash;
   - performs no state mutation beyond preview/audit preparation.
2. `POST /api/admin/notifications/replay-confirm`
   - requires `previewId`, `selectionHash`, and non-blank reason;
   - revalidates role, preview expiry, replayable statuses, and selection stability;
   - records an audit-ready action;
   - updates only rows eligible for replay under the existing notification state machine.

No one-step replay action is allowed.

### Permissions

- OWNER: read all admin notification operations and perform replay.
- OPERATOR: read all admin notification operations and perform replay. Replay is an operational recovery action, not a support grant.
- SUPPORT: read safe summaries and ledgers, no replay.
- Member/guest: no access.

If the team later wants replay to become OWNER-only, that is a product policy change and needs a spec amendment before implementation.

### Public Safety

Never expose:

- full email body;
- raw SMTP/provider error;
- raw recipient lists;
- private member notes or feedback content;
- tokens, credentials, domains, deployment identifiers, or internal hostnames.

Allowed examples and UI values must use sanitized club names and placeholder identities.

### Acceptance Gate

S5 is ready when:

- `/admin/notifications` is READY and the route catalog/nav reflect that status.
- A health card drill-down lands on the relevant notification/outbox view state.
- Failure clusters explain cause categories without raw provider details.
- Replay cannot run without dry-run preview, confirm, reason, permission checks, and audit-ready metadata.
- Unit, controller, route, and E2E tests cover the happy path and unsafe request rejection.

## 6. Phase 2: S3 Club Operations Console

### Purpose

Make `/admin/clubs/:id` answer: "What is happening with this club, what needs attention, and where should I go next?"

The page should be a platform-admin operations snapshot. It must not become a host dashboard clone.

### Route UX

Expand `/admin/clubs/:id` into:

- club identity and readiness header;
- operations snapshot sections;
- member activity aggregate;
- session lifecycle aggregate;
- notification health summary;
- AI usage/cost summary;
- platform-owned public readiness and domain status;
- host-app deep links for host-owned work.

The page may retain existing public metadata and readiness affordances, but host-owned commands stay in the host app. Admin can diagnose and coordinate, not perform attendance, RSVP, note, session editing, or publication-body operations.

### Data Contract

Introduce `AdminClubOperationsSnapshot`:

- `schema`
- `generatedAt`
- `club`
  - `clubId`
  - `slug`
  - `name`
  - `status`
  - `publicVisibility`
- `readiness`
  - checklist items
  - blocking reasons
  - next action
- `memberActivity`
  - active count
  - dormant count
  - pending/viewer count
  - host count
  - aggregate only by default
- `sessionProgress`
  - upcoming count
  - current/open count
  - closed count
  - published record count
  - stale or incomplete record count
- `notificationHealth`
  - pending/failed/dead delivery counts
  - last successful dispatch at
  - failure cluster summary
  - link to `/admin/notifications?clubId=...`
- `aiUsage`
  - active jobs
  - failed jobs in recent window
  - stale candidates
  - cost estimate aggregate
  - link to `/admin/ai-ops?clubId=...`
- `safeLinks`
  - host app links where applicable

KPI field naming should be stable enough for S8 analytics and S9 host-surface reuse. If a metric is not meaningful with local seed data, return an honest empty or insufficient-data state rather than a mock value.

### Permissions

- OWNER/OPERATOR/SUPPORT may read safe aggregate operations snapshots.
- OWNER/OPERATOR retain existing platform-owned mutation affordances where current policy allows them.
- SUPPORT remains read-mostly and must not receive new mutation authority from this phase.

Any sensitive reveal beyond aggregate counts is out of scope for this phase.

### Public Safety

Default to aggregate and masked output. Do not expose:

- member private notes;
- feedback document body;
- RSVP individual details;
- raw email lists;
- generated AI result JSON;
- provider raw response or transcript.

### Acceptance Gate

S3 is ready when:

- `/admin/clubs/:id` renders a complete operations snapshot for seeded/local-safe data.
- Empty and insufficient-data states are explicit and honest.
- Host-owned operations are represented as links or guidance, not duplicated admin commands.
- `AdminClubOperationsSnapshot` has contract tests on server and matching frontend types.
- Route tests cover selected club, missing club, permission posture, loading, and panel failure states.

## 7. Phase 3: S4 Support Workbench

### Purpose

Replace raw UUID support grant work with a safe operator workflow:

```text
search
→ resolve safe result
→ choose club/scope/expiry/reason
→ create grant
→ revoke/history
```

This improves OWNER usability and reduces support mistakes without turning admin into a general member-management console.

### Route UX

`/admin/support` becomes a READY workbench:

- search input accepts email, display-name text, or UUID;
- results show safe identity rows;
- selecting a result opens grant context;
- grant creation form is unavailable until a result is selected;
- active grants and recent grant history are visible;
- revoke shows inline state and safe failure copy.

If the operator came from a club page, `/admin/support?clubId=...` may preselect the club context. The workbench should still require a resolved grantee result before grant creation.

### Data Contract

Introduce support workbench contracts:

- `AdminSupportSearchResult`
  - `subjectId`
  - `displayName`
  - `maskedEmail`
  - `kind`
  - `platformAdminRole`
  - `platformAdminStatus`
  - `clubMembershipSummary`
  - `grantEligible`
  - `grantBlockedReason`
- `AdminSupportGrantLedgerItem`
  - `grantId`
  - `club`
  - `grantee`
  - `scope`
  - `reason`
  - `expiresAt`
  - `createdAt`
  - `revokedAt`
  - `status`
  - `createdByRole`
- `AdminSupportGrantRequest`
  - `clubId`
  - `granteeSubjectId`
  - `scope`
  - `reason`
  - `expiresAt`

Search should be exact or bounded enough to avoid a broad member directory. If fuzzy name search is implemented, it must have tight result limits and masked output.

### Application Validation

Grant creation must validate:

- actor is OWNER;
- selected grantee exists;
- grantee is an active platform admin;
- selected club exists and is in a grant-eligible state;
- scope is supported;
- reason is non-blank;
- expiry is in the future;
- expiry does not exceed the configured maximum duration;
- duplicate active grant behavior is explicit, either rejected or updated through a documented action.

Revoke must validate:

- actor is OWNER;
- grant exists;
- grant is active;
- action writes audit-ready metadata.

### Permissions

- OWNER: search, create, revoke, view ledger.
- OPERATOR: search and view the safe ledger, no create/revoke.
- SUPPORT: view limited safe support context for assigned work, no create/revoke.
- Member/guest: no access.

If the team later wants support search to become OWNER-only, that is a product policy change and needs a spec amendment before implementation.

### Public Safety

Search output must be masked and purpose-bound. Do not expose:

- raw email unless the current authenticated role already has a documented reason to see it;
- member private data;
- support transcripts;
- broad member directory exports;
- private operational notes.

### Acceptance Gate

S4 is ready when:

- raw UUID-only grant creation is gone from the primary UI.
- grant creation cannot proceed without selecting a resolved search result.
- each validation rule has server tests.
- frontend tests prove search, selection, disabled grant state, create, revoke, and safe errors.
- E2E covers search -> grant -> revoke with public-safe fixture data.

## 8. Shared Permission And Public-Safety Rules

Role posture:

| Surface | OWNER | OPERATOR | SUPPORT |
| --- | --- | --- | --- |
| `/admin/notifications` read | allowed | allowed | safe read |
| `/admin/notifications` replay | allowed | allowed | denied |
| `/admin/clubs/:id` operations snapshot | allowed | allowed | safe read |
| `/admin/clubs/:id` platform mutations | existing policy | existing policy | denied |
| `/admin/support` search | allowed | allowed | limited safe context |
| `/admin/support` create/revoke grant | allowed | denied | denied |

UI affordances are not authorization. Server-side application services must enforce each write boundary.

Public repository safety applies to all implementation artifacts:

- no real member data;
- no private domains;
- no deployment state;
- no local absolute paths;
- no OCIDs;
- no secrets or token-shaped examples;
- no raw provider, SMTP, SQL, or stack-trace details.

Fixtures should use sanitized names and placeholder addresses such as `host@example.com` only where an email-shaped value is necessary.

## 9. Error Handling

Separate failure surfaces:

- Route loader failure: route-level error boundary.
- Snapshot panel failure: panel-level fallback while the rest of the route stays usable.
- Replay preview failure: preview panel inline error.
- Replay confirm failure: confirm panel inline error and no optimistic success.
- Club operations partial failure: section-level unavailable states.
- Support search failure: search panel inline error.
- Support grant create/revoke failure: grant panel inline error and current ledger remains visible.

Safe error copy must avoid raw backend details. It should state what failed, whether the operator can retry, and what role or input condition blocks the action.

Invalid or stale timestamps must not render `NaN` text. Empty states should be explicit, especially for local fixture data.

## 10. Testing And Release Gates

### Phase 1: S5

Minimum checks:

- server service tests for filters, dry-run replay, confirm replay, failure clustering, permission denial, and unsafe request rejection;
- controller tests for masked response shape and validation errors;
- frontend model/query/route/UI tests for filter state, drill context, disabled/enabled replay, confirm state, and safe failure copy;
- Playwright E2E from `/admin/health` outbox card to `/admin/notifications`;
- `pnpm --dir front lint`;
- `pnpm --dir front test`;
- `pnpm --dir front build`;
- targeted server unit tests or `./server/gradlew -p server unitTest`;
- `git diff --check`.

### Phase 2: S3

Minimum checks:

- server contract tests for `AdminClubOperationsSnapshot`;
- service tests for aggregate calculations and masking rules;
- frontend route/UI tests for selected club, missing club, permission posture, loading, empty, and partial error states;
- Playwright E2E for club operations snapshot;
- frontend lint/test/build;
- targeted server unit tests;
- `architectureTest` if new cross-feature dependencies are introduced;
- `git diff --check`.

### Phase 3: S4

Minimum checks:

- server tests for lookup behavior and every grant validation rule;
- controller tests for masked search results, create, revoke, permission denial, and safe errors;
- frontend tests proving raw UUID-only grant flow is gone;
- frontend tests for search -> select -> create -> revoke;
- Playwright E2E for search -> grant -> revoke;
- frontend lint/test/build;
- targeted server unit tests;
- `git diff --check`.

### Integrated Release Readiness

Before shipping all three phases together, run:

- `pnpm --dir front lint`
- `pnpm --dir front test`
- `pnpm --dir front build`
- `pnpm --dir front test:e2e`
- `./server/gradlew -p server clean test`
- `./server/gradlew -p server architectureTest` if boundaries changed
- `./scripts/build-public-release-candidate.sh`
- `./scripts/public-release-check.sh .tmp/public-release-candidate`

Each phase should add a concrete CHANGELOG `Unreleased` entry when behavior ships.

## 11. Non-Goals

- Do not build `/admin/audit` in this spec. Only produce audit-ready action metadata for S5 and S4.
- Do not build `/admin/analytics` in this spec. S3 should produce reusable KPI contracts, but S8 remains separate.
- Do not move host session editing, attendance, RSVP, note, publication-body editing, or manual host workflows into `/admin`.
- Do not expose full email bodies, raw recipient lists, raw SMTP/provider errors, transcripts, generated AI result JSON, private notes, or feedback document bodies.
- Do not add provider key management, Grafana embedding, Alertmanager webhook management, or external incident-tool integration.
- Do not publish raw Graphify output or local operational artifacts.

## 12. Risks And Mitigations

| Risk | Phase | Mitigation |
| --- | --- | --- |
| S5 replay changes notification state incorrectly | S5 | Two-step preview/confirm, selection hash, status revalidation, service tests |
| Operator sees private notification content | S5 | Masked DTOs, no body fields, controller tests for response shape |
| Club operations becomes a host dashboard clone | S3 | Read-mostly snapshot, host-owned commands remain deep links |
| KPI fields drift before S8/S9 reuse | S3 | Contract tests and explicit `AdminClubOperationsSnapshot` owner |
| Support search becomes a member directory | S4 | Bounded search, masked output, purpose-bound UI |
| Raw UUID grant flow survives in another primary path | S4 | UI tests asserting search-result selection is required |
| Audit route arrives later and cannot explain old actions | S5/S4 | Originating phases write audit-ready metadata immediately |
| Public repo safety regresses through fixtures or docs | All | Use sanitized examples and targeted public-safety scans |

## 13. Plan Handoff

After this spec is reviewed, write one implementation plan for the integrated operating console expansion. The plan should keep phase boundaries explicit and executable:

1. S5 `/admin/notifications` READY route and admin notification/outbox operations.
2. S3 `/admin/clubs/:id` operations snapshot.
3. S4 `/admin/support` searchable support workbench.

The plan may split phases into separate worker tasks or commits, but it should preserve this spec as the single design source for the next admin vNext expansion.
