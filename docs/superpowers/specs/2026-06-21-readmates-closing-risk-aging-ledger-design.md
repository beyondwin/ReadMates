# ReadMates Closing Risk Aging Ledger Design

작성일: 2026-06-21
상태: APPROVED DESIGN SPEC
대상 표면: server, frontend, platform admin, docs

## 1. 배경

ReadMates는 최근 회차 클로징 흐름을 운영 가능한 read surface로 확장했다.

- 호스트는 `/clubs/:slug/app/host/sessions/:sessionId/closing`에서 회차별 클로징 상태와 다음 조치를 확인한다.
- 플랫폼 운영자는 `/admin/clubs/:clubId`에서 클럽별 session closing risk를 보고 host closing board로 이동한다.
- `/admin/today`는 admin-safe closing risk queue를 보여 주며, 매일 어떤 클럽/회차가 막혔는지 발견할 수 있다.

현재 남은 빈틈은 추적성이다. `/admin/today`와 club detail은 현재 계산된 risk를 보여 주지만, 운영자가 "며칠째 막혔는가", "같은 blocker가 반복되는가", "host 조치 후 해소됐는가"를 durable하게 판단할 수 없다.

이 설계는 closing risk snapshot 위에 aging/resolution ledger를 얹는다. 범위는 admin-safe 감지, 추적, 해소 상태 표시다. 플랫폼 admin이 세션 내용, 피드백 문서, 알림 발송, 기록 공개를 직접 수정하는 mutation은 포함하지 않는다.

## 2. Source Documents

- Agent router: `AGENTS.md`
- Frontend guide: `docs/agents/front.md`
- Server guide: `docs/agents/server.md`
- Design guide: `docs/agents/design.md`
- Documentation guide: `docs/agents/docs.md`
- Architecture source of truth: `docs/development/architecture.md`
- Release readiness checklist: `docs/development/release-readiness-review.md`
- Existing session closing flywheel spec: `docs/superpowers/specs/2026-06-18-readmates-session-closing-flywheel-design.md`
- Existing platform-admin closing projection spec: `docs/superpowers/specs/2026-06-19-readmates-platform-admin-closing-projection-design.md`
- Existing admin today closing risk spec: `docs/superpowers/specs/2026-06-20-readmates-admin-today-closing-risk-recovery-design.md`

Current code, migrations, route tests, and API contracts remain the source of truth if they conflict with historical planning notes.

## 3. Goals

- Make `/admin/today` answer how long each active closing risk has been open.
- Preserve first-detected, last-seen, resolved, and repeat-count information for each risky club/session pair.
- Let `/admin/clubs/:clubId` distinguish active risks from recently resolved risks.
- Keep repair actions host-owned by linking to the host closing board instead of adding platform-admin session mutations.
- Keep the ledger public-repo safe by storing only session-level safe metadata and blocker/state enums.
- Reuse the existing platform-admin closing risk calculation as the detection source.
- Keep implementation inside the existing server port/service/adapter boundary and frontend route-first feature structure.

## 4. Non-Goals

- No platform-admin mutation for session content, feedback document text, generated result JSON, publication contents, or notification send.
- No raw member data, email body, feedback body, transcript, generated JSON, provider raw error, private domain, deployment identifier, secret, token-shaped value, or local absolute path in the ledger, fixtures, UI, or docs.
- No separate scheduled worker in the first pass.
- No complete event-sourcing history table in the first pass.
- No charting library or trend dashboard.
- No public guest surface change.
- No host authorization bypass.

## 5. Selected Approach

Three approaches were considered.

1. Add age labels in frontend only.
   - Low risk, but false durability. Reloads or query gaps cannot prove first detection or resolution.

2. Add a durable ledger row per club/session and update it from admin read paths.
   - Best fit. It gives operators durable aging and resolution without adding scheduler infrastructure or admin write authority over session content.

3. Add full event-sourced risk history plus scheduled scanner.
   - More complete, but too heavy for this pass. It can be added later behind the same service boundary.

This design chooses approach 2.

## 6. Architecture

The existing computed closing risk remains the detection source. The new ledger stores operational tracking state derived from that safe projection.

```text
session closing computed state
  -> platform admin closing risk scanner
  -> admin_closing_risk_ledger upsert/resolve
  -> /api/admin/today/closing-risks
  -> /admin/today queue and /admin/clubs/:clubId detail
```

Server package boundary:

```text
adapter.in.web -> application.port.in -> application.service -> application.port.out -> adapter.out.persistence
```

Rules:

- Controller parses the route and calls a use case.
- Application service requires `CurrentPlatformAdmin`, merges current snapshot with ledger state, and derives public-safe response fields.
- Persistence adapter owns SQL, Flyway-backed ledger rows, and upsert/resolve mechanics.
- Application service does not depend on Spring Web/HTTP, JDBC, Redis, or adapter types.
- Platform-admin repair remains a link to the host closing board.

## 7. Ledger Data Model

Add a production Flyway migration for a new table:

```text
admin_closing_risk_ledger
- id
- club_id
- session_id
- current_state
- primary_blocker
- first_detected_at
- last_seen_at
- resolved_at
- occurrence_count
- last_host_closing_href
- created_at
- updated_at
```

Suggested constraints:

- Unique key on `(club_id, session_id)`.
- Foreign keys to `clubs(id)` and `sessions(id)`.
- Index on `(current_state, last_seen_at)`.
- Index on `(club_id, current_state, last_seen_at)`.

Allowed stored values:

- `current_state`: `BLOCKED`, `IN_PROGRESS`, `READY`, `RESOLVED`
- `primary_blocker`: safe blocker enum string or null
- `last_host_closing_href`: canonical host closing path only, such as `/clubs/:slug/app/host/sessions/:sessionId/closing`

Do not store raw feedback text, notification body, generated content, provider errors, member identity, or private operational values.

## 8. State Transition

The ledger is keyed by club/session. One row is reused for the same session.

```text
not tracked
  -> detected as BLOCKED / IN_PROGRESS / READY
  -> same risk seen again
  -> blocker or state changed
  -> no longer risky: RESOLVED
  -> risk reappears later
```

Rules:

- First detection creates a ledger row with `first_detected_at` and `last_seen_at`.
- Repeated detection updates `last_seen_at`.
- If state or blocker changes while active, update `current_state` and `primary_blocker`, but keep `first_detected_at`.
- `occurrence_count` increments when a previously resolved row becomes active again, not on every read.
- If a row is active but the current computed snapshot no longer contains that session, mark it `RESOLVED` and set `resolved_at`.
- If a resolved row reappears, clear `resolved_at`, update state/blocker, set `last_seen_at`, and increment `occurrence_count`.
- `ageDays` is derived from `first_detected_at`, not stored.

## 9. API Contract

Extend existing platform-admin responses additively.

```text
GET /api/admin/today/closing-risks
GET /api/admin/clubs/{clubId}/operations
```

Add fields to closing risk items:

```json
{
  "firstDetectedAt": "2026-06-18T00:00:00Z",
  "lastSeenAt": "2026-06-21T00:00:00Z",
  "resolvedAt": null,
  "ageDays": 3,
  "occurrenceCount": 1,
  "ledgerState": "ACTIVE"
}
```

`ledgerState` values:

- `ACTIVE`: ledger row exists and the current snapshot still reports the risk.
- `RESOLVED`: ledger row exists and the risk has been resolved.
- `UNTRACKED`: current snapshot exists but ledger state could not be read or has not been created yet.

Compatibility:

- Existing frontend must keep working if these fields are absent.
- New frontend treats missing fields as `UNTRACKED` with null age.
- Unknown state or blocker codes render as safe `확인 필요` copy.

## 10. Sync Policy

The first implementation should update the ledger from admin read paths instead of adding a scheduler.

Read flow:

1. Compute the current closing risk snapshot.
2. Load current ledger rows for the relevant club/session scope.
3. Upsert active risks.
4. Resolve active ledger rows that are no longer present in the current snapshot.
5. Merge ledger fields into the response.

This keeps infrastructure small and gives operators durable tracking when they use the admin console. The limitation is explicit: if no admin reads the surface, the ledger is not refreshed. A later scheduler can reuse the same application service if continuous background tracking becomes necessary.

Failure policy:

- Snapshot failure keeps existing route behavior.
- Ledger read/write failure must not expose private error details.
- If snapshot succeeds but ledger sync fails, return current risks with `ledgerState = "UNTRACKED"` and a UI-level `추적 상태 확인 불가` signal.
- Do not blank the whole `/admin/today` workbench only because ledger tracking failed.

## 11. Frontend UX

`/admin/today` remains the first operating queue. Closing risk rows gain concise aging metadata.

Examples:

```text
한빛 독서모임 · No.12 모던 자바스크립트
3일째 차단 · 피드백 문서 확인 필요 · 반복 2회
호스트 클로징 보드
```

Rules:

- Active `BLOCKED` and `IN_PROGRESS` risks stay in the queue.
- `READY` risks can show lower urgency copy, such as `조치 대기`.
- Recently resolved risks do not appear in the default Today queue.
- Ledger unavailable state appears as `추적 상태 확인 불가`, not raw exception text.

`/admin/clubs/:clubId` shows both active and recently resolved session closing risks:

- Active risks: state, blocker, age, first detected, last seen, occurrence count, host closing link.
- Recently resolved risks: session, resolved time/date, prior blocker, host closing link or club detail fallback.
- If space is tight, resolved rows can live under a compact "최근 해소됨" subsection.

The UI should use existing platform-admin table/list patterns. Do not add explanatory paragraphs about how the ledger works inside the app.

## 12. Testing

Server tests:

- Persistence integration for first detection.
- Persistence integration for repeat active read without occurrence inflation.
- Persistence integration for blocker/state change preserving `first_detected_at`.
- Persistence integration for resolved transition.
- Persistence integration for reappeared risk incrementing `occurrence_count`.
- Controller contract for additive fields and public-safe body.
- Service unit tests for snapshot plus ledger merge and `ageDays` calculation.
- Architecture test remains clean.

Frontend tests:

- Model tests for age label, repeat label, resolved label, and unknown fallback.
- Workbench model tests for active queue ordering and partial ledger failure.
- Route/UI tests for `/admin/today` row rendering.
- Club detail tests for active and recently resolved rows.
- Targeted E2E with public-safe fixtures proving `3일째 차단` and host closing board link.

Verification commands:

```bash
pnpm --dir front lint
pnpm --dir front test
pnpm --dir front build
./server/gradlew -p server clean test
./server/gradlew -p server check
./server/gradlew -p server architectureTest
pnpm --dir front test:e2e -- tests/e2e/admin-today-closing-risks.spec.ts
./scripts/build-public-release-candidate.sh
./scripts/public-release-check.sh .tmp/public-release-candidate
```

If implementation changes broader admin routing, run the full frontend E2E suite.

## 13. Release Notes

Release classification: additive DB migration plus additive server/frontend admin contract.

Deployment order:

1. Deploy server first so the new migration and additive API fields are available.
2. Deploy frontend after server promotion.

Compatibility:

- Old frontend ignores new fields.
- New frontend handles missing ledger fields as `UNTRACKED`.
- No auth/BFF token change.
- No platform-admin session mutation.
- No deploy script behavior change expected.

CHANGELOG should mention that platform-admin closing risks now show aging and resolution tracking. Release-readiness notes should record DB migration, public-safe ledger contents, targeted E2E, and public release candidate checks.

## 14. Acceptance Criteria

- `/admin/today` shows active closing risks with age and occurrence metadata when ledger data is available.
- `/admin/clubs/:clubId` distinguishes active and recently resolved closing risks.
- Ledger rows are created, updated, resolved, and reactivated deterministically.
- Ledger failure degrades to safe tracking-unavailable copy without blanking the workbench.
- API/UI do not expose raw member data, feedback body, generated JSON, provider raw error, secrets, private domains, or token-shaped values.
- Platform admin receives links to host-owned repair surfaces but no session-content mutation.
- Server/frontend/docs checks run or skipped commands are explicitly reported.

## 15. Self-review

- Placeholder scan: no unfinished placeholder markers.
- Internal consistency: the design keeps computed closing risk as source and ledger as durable tracking state.
- Scope check: the first pass is a single server/frontend/admin slice with one additive migration; scheduler and event-sourced history are deferred.
- Ambiguity check: `ACTIVE`, `RESOLVED`, and `UNTRACKED` response semantics are explicit, and missing ledger fields have a safe fallback.
