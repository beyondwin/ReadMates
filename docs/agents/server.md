# Server Agent Guide

Read this for work under `server/`.

The server is a Kotlin Spring Boot API in one module. New or migrated feature code should follow feature-local clean architecture:

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

Persistence adapters own SQL/JPA details, DB rows, and column mapping.

Security boundaries:

- Browser traffic should go through Cloudflare/Vite same-origin BFF routes.
- Server API should treat `X-Readmates-Bff-Secret`, session cookies, membership status, role, and attendance as authorization boundaries.
- Public APIs must expose only published public records.
- Password/password-reset routes are disabled operational paths; do not revive them unless explicitly requested.

Checks:

```bash
./server/gradlew -p server clean test
```

For API, auth, BFF, or user-flow changes, also run:

```bash
pnpm --dir front test:e2e
```
