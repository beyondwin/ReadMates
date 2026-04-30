# Server Agent Guide

Read this for work under `server/`.

The server is a Kotlin Spring Boot API in one module. New or migrated feature code should follow feature-local clean architecture:

Successful server changes keep HTTP parsing in inbound adapters, authorization and domain rules in application services, persistence details behind outbound ports/adapters, and public data exposure tied to the documented visibility model.

```text
adapter.in.web -> application.port.in -> application.service -> application.port.out -> adapter.out.persistence
```

Preferred feature layout:

```text
com.readmates.<feature>
  adapter.in.web
  adapter.out.persistence
  application.port.in
  application.port.out
  application.service
  application.model
  domain
```

Controller responsibilities: route annotations, request parsing/validation, `CurrentMember` parameter intake, use case calls, response mapping, HTTP status.

Controller must not own SQL, inject `JdbcTemplate`, inject legacy repositories directly, call persistence adapters, or hold complex authorization logic.

Application services own orchestration, membership/role/session authorization, domain rules, and outbound port calls.

Application services must not throw Spring web/http exceptions. Use feature application errors and map them in `adapter.in.web`.

Persistence adapters own SQL/JPA details, DB rows, and column mapping.

Security boundaries:

- Browser traffic should go through Cloudflare/Vite same-origin BFF routes.
- Server API should treat `X-Readmates-Bff-Secret`, session cookies, membership status, role, and attendance as authorization boundaries.
- Public APIs must expose only records whose publication visibility is `PUBLIC`; do not assume `sessions.state=PUBLISHED` is the only public exposure path.
- Password/password-reset routes are disabled operational paths; do not revive them unless explicitly requested.

Read another guide when the server task crosses surfaces:

- Frontend API client, route behavior, BFF proxy, or user-flow changes: `docs/agents/front.md`.
- UI or copy changes caused by server behavior: `docs/agents/design.md`.
- README, deploy docs, scripts docs, or agent instructions: `docs/agents/docs.md`.

Ask before editing if the required authorization boundary, migration behavior, or API compatibility expectation is unclear from current code and `docs/development/architecture.md`. Stop and report if a change would expose private records, raw tokens, credentials, real member data, or deployment identifiers.

Checks:

```bash
./server/gradlew -p server clean test
```

For API, auth, BFF, or user-flow changes, also run:

```bash
pnpm --dir front test:e2e
```

Done when the changed slice respects the adapter/service/port boundary, relevant tests are run or explicitly reported as skipped, and any API contract change is reflected in the matching frontend or documentation surface.
