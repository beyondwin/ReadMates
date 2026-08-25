# ReadMates Acceptance Matrix

Use this matrix to select risk evidence for the touched slice. Select only relevant rows, record why each was selected, and state why adjacent high-risk rows do not apply.

Related guidance: [architecture](architecture.md), [vertical-slice checklist](vertical-slice-checklist.md), and the [frontend](../agents/front.md), [server](../agents/server.md), [design](../agents/design.md), and [documentation](../agents/docs.md) surface guides.

| Trigger | Minimum states or failures to consider | Evidence direction |
| --- | --- | --- |
| Actor or authorization | anonymous `GUEST`, logged-in `VIEWER`, active `MEMBER`, `HOST`, platform admin; locked guest direct URLs and denied writes | Focused authorization test plus denied-path evidence |
| Club context | scoped club, unscoped compatibility route, different club context, trusted BFF-derived context | Route/BFF/server test proving club isolation |
| 모임 lifecycle | `DRAFT`, `OPEN`, `CLOSED`, `PUBLISHED`; reverse transition과 current-row lock 경쟁 | Allowed/rejected transition, locked-current classification, and race evidence |
| Guest/public exposure | `HOST_ONLY` vs `GUEST_READABLE`, `HIDDEN` vs `PUBLIC_RECORD`, DRAFT/OPEN/CLOSED/PUBLISHED validity, one-release compatibility dual-write, cache invalidation | Canonical domain/migration test, guest/public query contract, and affected frontend state |
| Guest DTO privacy | approved display name/RSVP/attendance/draftThought/author fields; forbidden account/member IDs, email, exact location, meeting URL/passcode, feedback body | Serialized response allowlist/forbidden-key test and anonymous BFF/browser request inventory |
| BFF or OAuth | same-origin proxy, cookie/session ID rotation on every callback exit, safe exact raw return path, POST-issued expiring one-use join intent, exact provider-state binding across multiple tabs, reverse-order success/failure with remaining-state survival, valid app-cookie preservation and proven stale-cookie expiry on provider/domain errors, crafted GET/replay/mismatch rejection, raw invite-parameter priority, target-club join, trusted header stripping | BFF unit test, actual success/failure handler plus OAuth repository/integration test, and relevant E2E flow |
| Cursor collection | empty/first/continuation/last page, opaque mode fingerprint, epoch change, expiry/key rotation, duplicate or gap risk | Server snapshot/epoch integration plus route/model restart and focus evidence |
| Persistence or migration | Flyway ordering, forward compatibility, query behavior, rollback limitation | Focused integration test or full `integrationTest` lane |
| Async, cache, or provider | duplicate delivery, retry/dead recovery, unavailable Redis, timeout, typed provider failure; guest 429/Retry-After and case-insensitive no-store/private | Focused failure-path test and operator evidence |
| Public projection convergence | origin commit, immutable receipt, append-only `PENDING|SUCCEEDED|FAILED` attempts, provider-neutral failure, 120/60-second reader targets, previous 720-second cache window | Transaction/retention integration, browser fresh/stale timing evidence, and bounded low-cardinality operator projection |
| Emergency public takedown | capability OWNER/OPERATOR, SUPPORT/inactive/capabilityless deny, preview expiry/target drift, response loss, retry with same convergence id | Focused authorization/idempotency/audit integration plus incident runbook; activation remains blocked without R2a 720-second evidence |
| Host-client rollout | R1 support, R2a safety/cache, R2b browser v3, 24-hour residue-zero, R3 enforcement; mixed browser/BFF/backend pair | Structural checker plus protected attested runtime evidence; repository-only evidence is artifact-ready, not live-complete |
| UI or runtime state | loading, empty, denied, stale, error, wrapping, desktop, mobile; default 401 redirect vs explicit read/write recovery | Component/route test plus responsive or browser evidence |

## Handoff Record

- Selected rows and reasons
- Adjacent high-risk rows excluded and reasons
- Automated evidence
- Manual evidence
- Runtime, provider, or deploy validation not performed
