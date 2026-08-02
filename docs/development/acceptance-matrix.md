# ReadMates Acceptance Matrix

Use this matrix to select risk evidence for the touched slice. Select only relevant rows, record why each was selected, and state why adjacent high-risk rows do not apply.

Related guidance: [architecture](architecture.md), [vertical-slice checklist](vertical-slice-checklist.md), and the [frontend](../agents/front.md), [server](../agents/server.md), [design](../agents/design.md), and [documentation](../agents/docs.md) surface guides.

| Trigger | Minimum states or failures to consider | Evidence direction |
| --- | --- | --- |
| Actor or authorization | anonymous `GUEST`, logged-in `VIEWER`, active `MEMBER`, `HOST`, platform admin; locked guest direct URLs and denied writes | Focused authorization test plus denied-path evidence |
| Club context | scoped club, unscoped compatibility route, different club context, trusted BFF-derived context | Route/BFF/server test proving club isolation |
| Session lifecycle | current code's creation, active, closing, and published states | Allowed and rejected transition evidence |
| Guest/public exposure | `HOST_ONLY` vs `GUEST_READABLE`, `HIDDEN` vs `PUBLIC_RECORD`, DRAFT/OPEN/CLOSED/PUBLISHED validity, one-release compatibility dual-write, cache invalidation | Canonical domain/migration test, guest/public query contract, and affected frontend state |
| Guest DTO privacy | approved display name/RSVP/attendance/draftThought/author fields; forbidden account/member IDs, email, exact location, meeting URL/passcode, feedback body | Serialized response allowlist/forbidden-key test and anonymous BFF/browser request inventory |
| BFF or OAuth | same-origin proxy, cookie/session, safe exact raw return path, POST-issued expiring one-use join intent, exact provider-state binding across multiple tabs, crafted GET/replay/mismatch rejection, target-club join, invite priority, trusted header stripping | BFF unit test, OAuth repository/service/integration test, and relevant E2E flow |
| Cursor collection | empty page, first page, continuation, last page, duplicate accumulation | Contract and route/model accumulation test |
| Persistence or migration | Flyway ordering, forward compatibility, query behavior, rollback limitation | Focused integration test or full `integrationTest` lane |
| Async, cache, or provider | duplicate delivery, retry/dead recovery, unavailable Redis, timeout, typed provider failure; guest 429/Retry-After and case-insensitive no-store/private | Focused failure-path test and operator evidence |
| UI or runtime state | loading, empty, denied, stale, error, wrapping, desktop, mobile; default 401 redirect vs explicit read/write recovery | Component/route test plus responsive or browser evidence |

## Handoff Record

- Selected rows and reasons
- Adjacent high-risk rows excluded and reasons
- Automated evidence
- Manual evidence
- Runtime, provider, or deploy validation not performed
