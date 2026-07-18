# ReadMates Acceptance Matrix

Use this matrix to select risk evidence for the touched slice. Select only relevant rows, record why each was selected, and state why adjacent high-risk rows do not apply.

Related guidance: [architecture](architecture.md), [vertical-slice checklist](vertical-slice-checklist.md), and the [frontend](../agents/front.md), [server](../agents/server.md), [design](../agents/design.md), and [documentation](../agents/docs.md) surface guides.

| Trigger | Minimum states or failures to consider | Evidence direction |
| --- | --- | --- |
| Actor or authorization | anonymous, invited or pending user, active member, host, platform admin | Focused authorization test plus denied-path evidence |
| Club context | scoped club, unscoped compatibility route, different club context, trusted BFF-derived context | Route/BFF/server test proving club isolation |
| Session lifecycle | current code's creation, active, closing, and published states | Allowed and rejected transition evidence |
| Publication visibility | host-only, member-visible, public exposure, cache invalidation | Server/public API test and affected frontend state |
| BFF or OAuth | same-origin proxy, cookie/session, safe return path, trusted header stripping | BFF unit test and relevant E2E flow |
| Cursor collection | empty page, first page, continuation, last page, duplicate accumulation | Contract and route/model accumulation test |
| Persistence or migration | Flyway ordering, forward compatibility, query behavior, rollback limitation | Focused integration test or full `integrationTest` lane |
| Async, cache, or provider | duplicate delivery, retry/dead recovery, unavailable Redis, timeout, typed provider failure | Focused failure-path test and operator evidence |
| UI or runtime state | loading, empty, denied, stale, error, wrapping, desktop, mobile | Component/route test plus responsive or browser evidence |

## Handoff Record

- Selected rows and reasons
- Adjacent high-risk rows excluded and reasons
- Automated evidence
- Manual evidence
- Runtime, provider, or deploy validation not performed
