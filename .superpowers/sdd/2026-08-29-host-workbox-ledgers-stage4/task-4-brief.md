# Stage 4 Task 4 brief — named invitation links and host club settings

## Scope and authority

Implement only Stage 4 plan Task 4 from base `2a6b90834b6cf57f59d58924ccb5781e62a2a62a`.

- Authority: Stage 4 plan SHA-256 `fac96db28c440f2b05fd7c46b49fb1e31079859ed0b8c86da075e5811da4bdd2`; Proposed ADR-0048 SHA-256 `fc1fa96bfdd3862da4dd38a9336b1dffae82bc0d7ef31f884880fdd5aa9e1b08`.
- ADR impact: `none`. Do not create/update/supersede an ADR or reopen the broader design.
- Recheck the migration tail once. If it remains V63, use exactly `V64__named_host_invitation_links.sql` and `V65__host_club_settings_and_commands.sql`.
- Implement the files and exact named-link endpoints listed in Stage 4 Task 4. The plan does not prescribe settings path spelling; select one cohesive explicit `/api/host/club-settings...` family, lock it with controller/front/BFF tests, and document it in the report. Do not add generic destructive or catch-all mutation endpoints.
- Preserve the external untracked `design/mockups/2026-08-30-admin-operations-redesign/` tree untouched and unstaged.

## Named-link persistence and management

- V64 must create `host_invitation_links` and append-only `host_invitation_link_events` with the exact columns/semantics from the plan: club-scoped IDs, creator/actor membership, name, unique hash-only token, ACTIVE/PAUSED/EXHAUSTED/EXPIRED state, max/used count, expiry, monotonic revision, allowlisted before/after settings, idempotency key and timestamps. Cascade only on club deletion.
- Never persist/log/list/history/fixture/exception the raw token, share URL, recipient email or OAuth identity. Create returns a relative same-origin share path for the `lnk_` token for that logical idempotent command; list/history never return path/hash. A lost token is replaced, not revealed.
- Same idempotency key + same canonical command must never create a second link/event. A conflicting command must fail. If a replay returns the original share path, it must be safely regenerated without raw-token persistence; otherwise return the already-created receipt without re-disclosing secret material and make the one-time/unknown-outcome behavior explicit in tests/report.
- Management GET/POST/PUT requires current ACTIVE HOST in the trusted selected club, exact club isolation, optimistic `expectedRevision`, canonical validation, monotonic revisions and append-only events. Cover extend, pause/stop, resume where eligible, expiry/exhaustion, cursor pagination and concurrent conflicts.

## Public preview and signed OAuth consumption

- `InviteTokenFormat` must strictly discriminate legacy email tokens and `lnk_` named tokens. Both scoped and compatibility preview endpoints return one common redacted shape and canonical club path without exposing token internals beyond the caller-supplied canonical path.
- Named links are consumed only by the existing OAuth authorization/callback context. Preserve raw invite-parameter precedence, signed return-state expected-club binding, multiple-tab context isolation, session-ID rotation and email-invitation behavior.
- In one transaction: resolve/lock the link, verify expected club, ACTIVE/not expired/remaining use, connect or create the verified Google identity, reuse an already-ACTIVE membership idempotently without consuming a use, otherwise create/activate exactly one MEMBER and increment used count plus append history. Never grant HOST.
- Serialize concurrent last-use acceptance on the link row: exactly one new membership consumes the final use; loser fails controlled `INVITATION_LINK_EXHAUSTED` before membership mutation. Paused/expired/exhausted/cross-club/tampered tokens fail closed without membership/event/count mutation.
- Keep legacy password accept POST at `410 GONE`; add no unauthenticated accept mutation. Preserve public preview rate limiting and no token logging.

## Host club settings, co-hosts and close command

- V65 owns a dedicated host-settings revision and append-only allowlisted change history/command receipts; do not reuse platform-admin `admin_revision` as the host optimistic revision.
- Settings contract covers club name, approval policy, valid IANA default timezone, schedule reminder setting and record-publication default. Validate canonical values; update atomically using `expectedRevision`; return controlled stale conflict before mutation; append an allowlisted history record.
- Co-host changes must target an existing membership in the same club, preserve at least one ACTIVE HOST, obey exact role/capability rules, use optimistic club revision/idempotency, and never be reachable from named-link acceptance. Cross-club and inactive actors/targets fail before mutation.
- Club-end is a dedicated high-risk preview/confirm workflow. Preview is non-mutating and binds exact actor membership, club ID/revision and allowlisted effect hash. Confirm rechecks active HOST authority and revision, uses idempotent receipt semantics, rejects stale/mismatched/consumed preview before mutation, and has no generic delete endpoint. Tests use local fixture clubs only and must not end a real/user club.
- History/list/read responses must exclude token/hash, email, OAuth/user identity, session/page history and raw provider data.

## Frontend/BFF/UI contract

- Add strict feature-owned Zod contracts/API/query modules for named links and club settings. Query keys include club identity and paging identity; mutations invalidate only the relevant host settings/link keys.
- Add `host-settings-route.tsx` and the three listed settings UI components with explicit loading/empty/error/stale/unknown-outcome states, visible revisions/status, one-time copy affordance, editable settings and an unambiguous preview-before-confirm club-end dialog. Keep email invitations visibly separate as the compatibility feature.
- Preserve the calm paper/ink host ledger system, accessible labels/focus, reduced-motion compatibility and mobile-complete controls. CT/screenshot coverage is Task 8/9; this Task needs focused component/route behavior tests, not visual baselines.
- Extend the public invite page to preview either email or named link through the common redacted contract. Do not expose internals in browser state/storage. Add generic BFF method/path/query/club/error preservation and exact trusted-header stripping tests.
- Add strict deterministic fixtures/Zod exports and both server fixture/Zod contract tests. Export twice and require a stable second run.

## TDD, commits and focused evidence

1. RED named-link schema/service/controller/persistence/concurrency tests first, including one-time/hash-only privacy, idempotency, revision/history/cursors and management authorization.
2. RED public preview/OAuth tests next, including both token families, expected-club binding, already-active no-consume, last-use race, status denials, never-HOST and legacy POST 410.
3. RED settings/co-host/history and club-end preview/confirm tests before those implementations.
4. RED frontend API/query/route/UI/public-invite/BFF/fixture tests before frontend implementation.
5. Implement in focused commits if useful, but Task 4 closes only after all slices are committed and one fresh reviewer reviews `BASE..HEAD` against this brief. Include this brief and one final `task-4-report.md` in the Task range.
6. Run only Task 4 focused unit/integration/concurrency/OAuth/security/contract tests, focused frontend Vitest/ESLint, generic BFF tests and the isolated/local-safe Google invite E2E. No external provider/email, no real club end, and no full stage gates. Use Node 24 plus `npx --yes corepack@0.35.0 pnpm` for frontend commands.
7. Seal `source hash -> command -> result -> finding closure`, exact counts, per-file SHA-256 manifest, fixture double-export stability, `git diff --check`, targeted token/secret/private-data scan and skipped evidence. Force-add the ignored brief/report; commit only intended files.

## Exclusions

- No Task 5 workbox aggregation, Task 8 final ledger composition/CT, or Stage-wide gates.
- No public password acceptance, generic club deletion, live OAuth/provider/email call, real club termination, push, PR, tag or deployment.
- Do not fix the known unchanged Task 2 static-analysis residual inside this Task unless a Task 4 edit directly overlaps that exact file and the fix is mechanically required; report it separately.
