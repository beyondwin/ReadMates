# Stage 4 Task 5 brief — aggregate immutable host workbox API

## Scope and authority

Implement only Stage 4 plan Task 5 from base `ac0ba798d5e59063559fae08384b11e344fe4deb`.

- Authority: Stage 4 plan SHA-256 `fac96db28c440f2b05fd7c46b49fb1e31079859ed0b8c86da075e5811da4bdd2`; Proposed ADR-0048 SHA-256 `fc1fa96bfdd3862da4dd38a9336b1dffae82bc0d7ef31f884880fdd5aa9e1b08`.
- ADR impact: `none`. Do not update ADRs or reopen the broader design.
- Current migration tail is V65. Task 5 reuses approved V62 persistence and adds no migration unless repository reality contradicts this anchor; stop and report rather than inventing V66.
- Preserve external untracked `design/mockups/2026-08-30-admin-operations-redesign/` untouched and unstaged.

## Source ownership and exact semantics

Create the five exact source-owned input/service/output/JDBC files and five hostworkspace translator adapters named in the plan. Preserve this dependency direction:

```text
hostworkspace adapter/out/source -> source feature application input port
source application service -> source output query port -> source JDBC adapter
```

`hostworkspace.application` and `hostworkspace.domain` must import no source feature; no translator may import a foreign persistence adapter/repository. Architecture baselines remain byte-identical.

Implement the normative five-source table exactly:

- `SCHEDULE_UNSEEN`: session ID + exact scheduleRevision; NOW only AVAILABLE eligible STALE/UNSEEN count > 0; completed only same revision reaches zero with max exact-revision seen time; session start due; only aggregate dispatch ID/status/count receipt fields.
- `MEMBER_APPROVAL`: membership ID + request createdAt; NOW only pending VIEWER; completed when lifecycle leaves pending with transition time; request createdAt due; action/result/status only, never userId/email.
- `RECORD_CLOSING`: session ID + canonical session/record/publication vector hash; NOW only authoritative actionable/blocking incomplete closing step; completed for same generation published/resolved with apply/publish time; end/close due; safe receipt ID/state/summary only.
- `INVITATION_EXPIRY`: link ID + monotonic linkRevision; NOW only ACTIVE, remaining uses, expires within seven days; completed when that revision is extended/stopped/expired with audit time; link action/status/uses/max only, never token/path/hash/email.
- `NOTIFICATION_FAILURE`: delivery ID + attempt ordinal; NOW only unresolved FAILED/DEAD; completed when same delivery becomes an allowlisted resolved state; retry/failure due; event/channel/status/attempt/safe error code only, never recipient/provider body.

Each source returns typed `AVAILABLE` or its exact `*_SOURCE_UNAVAILABLE` state plus the full actionable/recent-resolved allowlist. Zero rows means no item. Expected source unavailability is data; unexpected SQL/transaction failures abort the first-page transaction and must not persist a partial snapshot.

## Aggregate, snapshot and cursor contract

- API exactly:
  - `GET /api/host/workbox?state=NOW|DEFERRED|COMPLETED&limit=20&cursor=...`
  - `PUT /api/host/workbox/items/{urlEncodedWorkItemKey}/deferral` body `{deferredUntil}`
  - `DELETE /api/host/workbox/items/{urlEncodedWorkItemKey}/deferral`
- Require the current membership to be an ACTIVE HOST in the trusted URL-selected club. Cross-club/host, inactive authority, malformed state/key/time/limit/cursor fail closed with controlled errors.
- Capture exactly one `evaluatedAt` and call sources in order `SCHEDULE_UNSEEN -> MEMBER_APPROVAL -> RECORD_CLOSING -> INVITATION_EXPIRY -> NOTIFICATION_FAILURE` within one read-only `REPEATABLE_READ` first-page transaction. Normalize, apply derived state/deferral and 30-day COMPLETED retention, and sort `(priority, dueAt nulls last, type, resourceId, sourceGeneration)`. Preserve zero counts as data; never treat zero as unavailable.
- Persist all ordered rows and five typed availability entries under one immutable V62 snapshot UUID/schema version with 15-minute expiry before returning page 1. If snapshot persistence fails, return no page. Continuations never call source ports and read only the owned unexpired snapshot.
- Item JSON allowlist is exactly `key,type,state,title,description,count,dueAt,deferredUntil,resolvedAt,destinationHref,receiptSummary`. Destination is scoped app-relative, contains no token/email/user/private value, and passes existing destination allowlist validation.
- `HostWorkboxCursorCodec` is strict and purpose-bound. Bind purpose/version, club ID, host membership ID, state/filter fingerprint, snapshot UUID/schema version, evaluatedAt, last ordinal/sort tuple, expiry and signing key version. Reject non-canonical/tampered, cross-club/host/state/filter/snapshot/schema, expired/deleted snapshot and retired key with a controlled restart error. No unsigned cursor fallback.
- Concurrent source mutation must not alter an existing snapshot page sequence; page 1 + all continuations have no gap/duplicate. A fresh first page must observe the changed source state.

## Deferral and security contract

- PUT creates/overwrites only a future deferral for the exact authoritative work-item key and current club+host. DELETE removes only that owner’s deferral. Deferral never marks a source completed; `deferredUntil <= evaluatedAt` appears as NOW even before bounded cleanup.
- A key must correspond to a current/recent authoritative source projection in the selected club; do not allow arbitrary attacker-chosen persistent keys or destination data.
- Register exact PUT/DELETE CSRF/trusted-BFF rules. Prove valid BFF secret+allowed origin, missing/invalid secret, invalid origin, forged browser internal headers, active-HOST loss and cross-club scope in `HostWorkboxBffSecurityTest`. GET remains non-mutating host read.

## Fixtures, TDD and focused evidence

1. RED each source service/query in the fixed order for identity/generation/NOW/completed/due/resolved/receipt privacy and typed unavailability.
2. RED aggregate source order, priority, zero-as-data, derived completion, defer/expiry return, 30-day retention, one transaction/evaluatedAt, partial vs unexpected failure and immutable snapshot behavior.
3. RED strict cursor first/continuation/last, tamper and all bound identity/state/expiry/key-rotation/restart cases; RED mutation-between-pages snapshot stability and fresh-first-page observation.
4. RED controller/security/deferral ownership and forbidden-key JSON tests, then implement the smallest server slice. Update strict deterministic Zod fixtures and both server contract tests; export twice and require stable hashes.
5. Run only the named five source tests, HostWorkbox service/controller/JDBC/BFF-security tests, focused contract/migration/architecture tests, fixture double-export, `git diff --check` and targeted public/private-data scan. Full Stage server/frontend/CT/E2E/public-release gates wait for Task 9.
6. Force-add this brief and `task-5-report.md`, commit only intended Task 5 files, and seal exact commands/counts/per-file SHA-256. Report any source whose expected failure path is not measured instead of synthesizing evidence.

## Exclusions

- No frontend query/model/UI (Tasks 6–8), named-link/settings changes, notification delivery, real provider/email, deployment, push, PR or tag.
- No Task 2 static-debt cleanup unless a Task 5 file directly overlaps and a mechanical fix is required.
