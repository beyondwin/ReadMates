# ReadMates Error Boundary Contract Design

## Summary

ReadMates needs a full error-boundary system rather than only a frontend 404 page. The current app has route-specific generic error elements, but missing routes, API error bodies, BFF-originated rejects, and server feature errors are not governed by one contract.

This design establishes one public-safe error contract across Spring API, Cloudflare Pages Functions BFF, frontend API parsing, React Router boundaries, user-facing error states, tests, and documentation.

## Goals

- Return API errors with a consistent shape:

```json
{
  "code": "SESSION_NOT_FOUND",
  "message": "요청한 세션을 찾을 수 없습니다.",
  "status": 404
}
```

- Let frontend route boundaries distinguish not found, permission denied, authentication required, conflict, service failure, and malformed/network failures.
- Add dedicated unmatched-route handling for public, member app, club-scoped app, host app, and final root fallback paths.
- Keep feature-specific unavailable states where the state is part of the product workflow.
- Keep all examples public-safe: no real member data, secrets, deployment hosts, stack traces, token-shaped values, or private domains.

## Non-Goals

- Do not introduce a new tracing, observability, or request-id platform in this slice.
- Do not expose backend stack traces, SQL details, SMTP errors, upstream hosts, secrets, raw tokens, internal exception class names, or private member data to the browser.
- Do not rewrite unrelated business validation copy unless it must conform to the error contract.
- Do not convert product-specific unavailable states, such as feedback-document unavailable pages or public-record missing states, into generic pages when the feature already owns a better workflow.

## Architecture

The source of truth is a public-safe API error contract:

```ts
type ApiErrorResponse = {
  code: string;
  message: string;
  status: number;
};
```

Converted Spring web handlers map selected application, domain, validation, and framework errors to this shape. BFF functions use the same shape for errors they originate and continue to strip internal headers from upstream responses. The frontend shared API layer parses the response into a richer `ReadmatesApiError`. Route boundaries use HTTP status and route context to choose public/member/host/auth-specific UI while preserving `code` on the typed error.

```text
Application/domain error
  -> Spring web error mapper
  -> { code, message, status }
  -> BFF pass-through or BFF-originated error
  -> frontend ReadmatesApiError
  -> scoped route error UI or not-found UI
```

## Server Design

Add a shared server web DTO for API failures, owned by the web adapter layer rather than application services. A suitable location is `server/src/main/kotlin/com/readmates/shared/adapter/in/web`.

Server responsibilities:

- Define `ApiErrorResponse(code: String, message: String, status: Int)`.
- Provide a small factory/helper for constructing responses from `HttpStatus` and public-safe codes.
- Update representative feature error handlers to return `ResponseEntity<ApiErrorResponse>` instead of empty bodies.
- Keep feature handlers responsible for mapping feature errors to stable codes.
- Add common handling for framework-level `ResponseStatusException` where appropriate, using stable codes and safe messages.

Initial code categories should be stable uppercase identifiers such as:

- `AUTHENTICATION_REQUIRED`
- `PERMISSION_DENIED`
- `RESOURCE_NOT_FOUND`
- `SESSION_NOT_FOUND`
- `CLUB_NOT_FOUND`
- `INVALID_REQUEST`
- `CONFLICT`
- `GONE`
- `SERVICE_UNAVAILABLE`
- `INTERNAL_ERROR`

Feature-specific codes may be more precise when the frontend already needs them, such as `DISPLAY_NAME_DUPLICATE` or `INVITATION_EXPIRED`.

Application services must continue to avoid Spring Web/HTTP dependencies. Mapping from application error to HTTP status/body remains in `adapter.in.web`.

## BFF Design

Cloudflare Pages Functions should use the same shape for errors they create before reaching Spring.

Add a helper under `front/functions/_shared`, for example:

```ts
function bffErrorResponse(status: number, code: string, message: string): Response
```

Use it for BFF-originated failures such as:

- invalid `/api/bff/**` upstream path: `404 RESOURCE_NOT_FOUND`
- same-origin mutation rejection: `403 PERMISSION_DENIED`
- invalid `clubSlug`: `400 INVALID_REQUEST`
- unsupported OAuth registration path: `404 RESOURCE_NOT_FOUND`

BFF pass-through behavior should preserve upstream status and safe body, while continuing to remove internal `x-readmates-*` response headers and never exposing BFF secrets.

## Frontend API Design

Expand `front/shared/api/errors.ts` so `ReadmatesApiError` includes:

- `status`
- `code`
- `message`
- existing response metadata
- a fallback flag or safe default when the response body is empty or malformed

Parsing rules:

- If a non-OK response has valid `{ code, message, status }`, use it.
- If the body is empty, create a safe fallback from HTTP status.
- If the body is malformed or not the expected shape, preserve the HTTP status and use a safe fallback code/message.
- 401 keeps the existing login redirect behavior for app API calls, but the contract and parser should make the behavior explicit.

Default frontend fallback classification:

| Status | Fallback code | UX category |
| --- | --- | --- |
| 400 | `INVALID_REQUEST` | bad request |
| 401 | `AUTHENTICATION_REQUIRED` | login required |
| 403 | `PERMISSION_DENIED` | permission denied |
| 404 | `RESOURCE_NOT_FOUND` | not found |
| 409 | `CONFLICT` | conflict/stale state |
| 410 | `GONE` | unavailable route |
| 5xx | `SERVICE_UNAVAILABLE` or `INTERNAL_ERROR` | service failure |

## Route Boundary Design

Add shared app-level route error primitives under `front/src/app`:

- `RouteErrorPage`
- `NotFoundRoute`
- helper to classify `useRouteError()` values

The route presenter accepts a visual/context variant:

- `public`
- `member`
- `host`
- `auth` or generic app shell where needed

Route behavior:

- Root-level `errorElement` catches unexpected router/render failures.
- Public layout handles unmatched public paths.
- Member app routes handle unknown `/app/**` and `/clubs/:clubSlug/app/**` paths.
- Host routes handle unknown `/app/host/**` and `/clubs/:clubSlug/app/host/**` paths.
- Existing feature route error components such as `ArchiveRouteError`, `PublicRouteError`, `FeedbackRouteError`, `HostRouteError`, and `CurrentSessionRouteError` should delegate to the shared presenter or become thin wrappers.

Product-specific states stay feature-owned:

- Missing public session UI remains in the public feature.
- Feedback document unavailable states remain in the feedback feature.
- Invitation validation copy remains in auth.
- Current-session conflict recovery may stay feature-specific when it can offer a precise next action.

## UX Rules

Error copy should be clear without over-explaining implementation details.

| Category | User-facing intent |
| --- | --- |
| 404 not found | The page or record cannot be found. Offer a safe route back to public home, app home, archive, or host dashboard depending on context. |
| 403 permission denied | The user is signed in but cannot access this club, member area, host tool, feedback document, or platform admin surface. |
| 401 authentication required | Preserve existing login return flow. Avoid showing a dead-end error page for normal session expiration. |
| 409 conflict | Prefer feature-specific recovery. Otherwise ask the user to refresh because the state may have changed. |
| 410 gone | Explain that the route or feature is no longer available and offer the current supported entry point. |
| 5xx/service failure | Safe outage copy. Ask the user to retry later or return to a stable route. |
| malformed/network failure | Safe generic failure copy without internal details. |

All states must preserve ReadMates' quiet editorial identity, accessible semantic structure, WCAG AA contrast, Korean/English wrapping, and desktop/mobile behavior.

## Testing Plan

Server:

- Unit or web tests for `ApiErrorResponse` shape.
- Representative feature error-handler tests for 400, 403, 404, 409, and 410 where those statuses are already present.
- Tests should verify public-safe body fields and avoid stack traces or internal exception names.

BFF:

- Tests for Pages Function-originated 400, 403, and 404 JSON error bodies.
- Existing proxy/header tests must continue to prove internal `x-readmates-*` response headers and secrets are not exposed.

Frontend:

- Unit tests for `ReadmatesApiError` parsing valid JSON, empty body, malformed body, and mismatched status.
- Router tests for unknown public, `/app/**`, `/clubs/:clubSlug/app/**`, `/app/host/**`, and `/clubs/:clubSlug/app/host/**` routes.
- Route error tests for at least 403, 404, 409, and 5xx classification.

Docs:

- Add an API error contract section to `docs/development/architecture.md`.
- Keep examples public-safe and generic.

Checks expected for implementation:

```bash
pnpm --dir front lint
pnpm --dir front test
pnpm --dir front build
./server/gradlew -p server clean test
pnpm --dir front test:e2e
git diff --check -- docs/development/architecture.md
```

If an implementation slice does not touch server, frontend, BFF, or docs, the corresponding check may be skipped with an explicit reason.

## Rollout Plan

Implement as one full-stack error-system effort, but in this order:

1. Define shared server API error DTO/helper and frontend parser contract.
2. Update BFF-originated errors to return the shared JSON shape.
3. Update representative server feature handlers and framework-level web errors.
4. Add frontend route error presenter, not-found routes, and root fallback.
5. Convert existing generic route error components into wrappers around the shared presenter.
6. Add tests for server, BFF, parser, and router behavior.
7. Update `docs/development/architecture.md`.

The implementation should avoid a high-risk blanket rewrite of every feature error in the first pass. The contract becomes the standard, the highest-value paths move immediately, and tests prevent new empty-body generic errors from being added.

## Open Decisions

- `requestId` remains out of the first contract. It can be added later as an optional field once request tracing exists end to end.
- The first implementation should decide whether `ResponseStatusException` gets one generic common handler or route-specific handlers for better codes. The design prefers common safe handling unless a feature needs a more precise product code.
- Exact Korean copy should be finalized during implementation against the existing public/member/host visual context.
