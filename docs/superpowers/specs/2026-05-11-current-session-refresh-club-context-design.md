# Current Session Refresh — Club Context Design

Status: draft (awaiting user review)
Owner: frontend
Last updated: 2026-05-11
Post-mortem: [docs/operations/postmortems/2026-05-11-current-session-refresh-club-context.md](../../operations/postmortems/2026-05-11-current-session-refresh-club-context.md)

## Goal

Fix the "current session" route refresh after a member-write (RSVP, reading-progress checkin, questions, long review, one-line review) so the refresh fetches with the same `clubSlug` the initial loader used. Today the refresh fires without the slug, the production BFF resolves club context from the request host instead, and the page collapses to the empty "아직 열린 세션이 없습니다" state until the user manually navigates away and back.

This spec covers a single bounded scope: the path-from-save-back-to-rendered-data inside `front/features/current-session/route/current-session-route.tsx`, plus the matching regression test.

## Symptoms

URL: `https://readmates.pages.dev/clubs/reading-sai/app/session/current`

1. Page loads correctly — current session details visible.
2. Member adjusts reading progress and clicks 저장.
3. Save call succeeds (HTTP 200; row written in MySQL).
4. UI replaces the session board with:

   > 세션 준비
   > 아직 열린 세션이 없습니다
   > 새 세션이 등록되면 참석 여부, 읽기 진행률, 질문 작성이 열립니다.

5. Empty state persists until the user navigates away and back. That round-trip proves the server state is fine — only the client refresh path is broken.

Reproduces only on `readmates.pages.dev`. Local Vite dev does not reproduce.

## Reproduction trace

### Client side

`front/features/current-session/ui/current-session-page.tsx:78-92`

```tsx
export function CurrentSessionPage({ auth, data, actions, internalLinkComponent, onSaveSuccess }) {
  if (data.currentSession === null) {
    return <CurrentSessionEmpty auth={auth} internalLinkComponent={internalLinkComponent} />;
  }
  return <CurrentSessionBoard ... onSaveSuccess={onSaveSuccess} />;
}
```

The empty state renders when `data.currentSession === null`. Therefore the refreshed loader data is `{ currentSession: null }`.

`front/features/current-session/route/current-session-route.tsx:56-84`

```tsx
useEffect(() => {
  const refresh = () => {
    const requestSequence = refreshSequence.current + 1;
    refreshSequence.current = requestSequence;

    void loadCurrentSessionRouteData()                  // ← no args
      .then((nextData) => { ... })
      .catch(() => { /* keep last successful data */ });
  };

  window.addEventListener(READMATES_ROUTE_REFRESH_EVENT, refresh);
  return () => { ... };
}, [loaderData]);
```

The refresh handler calls `loadCurrentSessionRouteData()` with no arguments.

`front/features/current-session/route/current-session-data.ts:30-40`

```ts
export async function loadCurrentSessionRouteData(args?: Pick<LoaderFunctionArgs, "params">) {
  const { auth, allowed } = await loadMemberAppAuth(args);   // args undefined → no clubSlug
  if (!allowed) {
    return { auth, current: { currentSession: null } };       // ← lands here on prod
  }
  const current = await getCurrentSession({ clubSlug: clubSlugFromLoaderArgs(args) });
  return { auth, current };
}
```

`front/shared/api/client.ts:18-33`

```ts
export function readmatesApiPath(path, context) {
  const clubSlug =
    context && Object.prototype.hasOwnProperty.call(context, "clubSlug")
      ? context.clubSlug         // ← explicit { clubSlug: undefined } wins over the URL fallback
      : currentAppClubSlug();
  if (!clubSlug || !path.startsWith("/api/")) {
    return path;
  }
  ...
}
```

`loadMemberAppAuth(undefined)` passes `{ clubSlug: undefined }` to `readmatesFetch`. The `hasOwnProperty` check intentionally treats explicit-undefined as "no club scope" (platform-admin pages depend on this). So the URL-pathname fallback (`currentAppClubSlug()`) is bypassed, and the request goes out as `/api/bff/api/auth/me` with no club query.

### BFF divergence (dev vs prod)

**Local Vite proxy** — `front/vite.config.ts:42-51`:

```ts
proxy.on("proxyReq", (proxyReq) => {
  proxyReq.removeHeader("X-Readmates-Club-Slug");
  proxyReq.removeHeader("X-Readmates-Club-Host");      // ← stripped
  const clubSlug = normalizedClubSlugFromProxyPath(proxyReq.path);
  if (clubSlug) {
    proxyReq.setHeader("X-Readmates-Club-Slug", clubSlug);
  }
});
```

The dev proxy strips both club headers and re-attaches `X-Readmates-Club-Slug` only when the URL has `?clubSlug=`. `X-Readmates-Club-Host` is never sent in dev.

**Cloudflare Pages function** — `front/functions/api/bff/[[path]].ts:151-154`:

```ts
headers.set("X-Readmates-Club-Host", normalizedHostFromRequest(context.request));   // ← always set
if (clubSlug) {
  headers.set("X-Readmates-Club-Slug", clubSlug);
}
```

Prod always forwards `X-Readmates-Club-Host` (= `readmates.pages.dev`), slug only when present.

### Server side

`server/.../ClubContextResolver.kt`

```kotlin
val slug = getHeader(ClubContextHeader.CLUB_SLUG)?.trim()?.takeIf { it.isNotEmpty() }
if (slug != null) {
  return RequestedClubContext(supplied = true, context = resolveBySlug(slug))
}
val host = getHeader(ClubContextHeader.CLUB_HOST)?.trim()?.takeIf { it.isNotEmpty() }
if (host != null) {
  return RequestedClubContext(supplied = true, context = resolveByHost(host))   // ← context may be null
}
return RequestedClubContext(supplied = false, context = null)
```

`server/.../JdbcClubContextAdapter.kt:34-53` — `loadByHostname` only matches rows in `club_domains` with `status = 'ACTIVE'`. `readmates.pages.dev` is a path-routed shared fallback, not a registered custom domain, so `loadByHostname("readmates.pages.dev")` returns `null`.

`server/.../AuthMeController.kt:23-44`

```kotlin
fun me(authentication: Authentication?, request: HttpServletRequest): AuthMemberResponse {
  val sessionProfileMember = authentication?.principal as? CurrentMember
  ...
  if (sessionProfileMember != null) {
    val requestedMember = requestedClubContext.context
      ?.let { context -> resolveByUserAndClub(sessionProfileMember.userId, context.clubId) }
    if (requestedClubContext.supplied && requestedMember == null) {
      return AuthMemberResponse.authenticatedUser(
        userId = sessionProfileMember.userId,
        email = sessionProfileMember.email,
        joinedClubs = joinedClubs,
        platformAdmin = platformAdmin,
      )                                                  // ← no membershipStatus
    }
    ...
  }
}
```

On prod with no slug + unresolved host: `supplied=true`, `context=null`, `requestedMember=null` → returns `authenticatedUser` without `membershipStatus`.

`front/shared/auth/member-app-access.ts:3-25`

```ts
export function canReadMemberContent(auth) {
  return auth.authenticated &&
    (auth.membershipStatus === "VIEWER" || auth.membershipStatus === "ACTIVE" || auth.membershipStatus === "SUSPENDED");
}
export function canUseMemberApp(auth) { return canReadMemberContent(auth); }
```

With no `membershipStatus`, `canUseMemberApp` returns `false`. `loadCurrentSessionRouteData` short-circuits with `{ currentSession: null }`. Component renders `CurrentSessionEmpty`.

### Why dev escapes the bug

| Layer | Dev | Prod |
|---|---|---|
| Vite/Pages BFF host header | stripped | always set |
| Backend `requestedClubContext.supplied` | `false` | `true` |
| Backend fallback | `resolveByEmail(email)` returns the active membership | `authenticatedUser` without membership |
| `canUseMemberApp(auth)` | `true` | `false` |
| Refresh outcome | session data refetched normally | `currentSession: null` |

The dev escape is incidental. Any future developer who, in good faith, mirrors the Cloudflare BFF's "always send the host header" semantics into dev would break dev too. The fix needs to be at the data-flow level (carry `clubSlug` through refresh), not at the BFF layer.

## Decision

**Source the refresh's `clubSlug` from React Router's `useParams()` and forward it as `{ params }` to `loadCurrentSessionRouteData` inside the refresh handler.**

Implementation summary:

```tsx
// front/features/current-session/route/current-session-route.tsx
import { useLoaderData, useParams } from "react-router-dom";

export function CurrentSessionRoute({ internalLinkComponent = AnchorInternalLink }) {
  const loaderData = useLoaderData() as CurrentSessionRouteData;
  const params = useParams();
  ...
  useEffect(() => {
    const refresh = () => {
      const requestSequence = refreshSequence.current + 1;
      refreshSequence.current = requestSequence;

      void loadCurrentSessionRouteData({ params })           // ← carry params
        .then((nextData) => { ... })
        .catch(() => { /* keep last successful data */ });
    };

    window.addEventListener(READMATES_ROUTE_REFRESH_EVENT, refresh);
    return () => { ... };
  }, [loaderData, params]);                                  // ← stale-closure guard
  ...
}
```

### Why this is the right shape

- **Single source of truth.** React Router already owns URL-derived params for this route. The initial loader receives them via `args.params`. The fix routes the same source to the refresh, instead of reinventing a parallel URL-parsing path.
- **Preserves the deliberate silent-refresh UX.** `current-session-route.tsx:73-75` swallows refresh errors and keeps the previously-loaded data on screen. The test `front/tests/unit/current-session.test.tsx` "keeps current session content visible when a route refresh fails" (line 202) codifies that. Patching `useParams()` in keeps this behavior; replacing the dispatcher with `useRevalidator` would break it (a thrown loader during revalidation renders the route's `errorElement`).
- **Minimal blast radius.** One file changed in implementation, one test added. No server change, no BFF change, no React Router migration.
- **Discoverable by reading.** A reader of `current-session-route.tsx` can now see at a glance that the route's slug is what scopes refreshes — no hidden URL parsing inside `client.ts`.

### Alternatives considered and rejected

| Alternative | Why rejected |
|---|---|
| Replace event/state shadow with `useRevalidator()`. | Changes silent-refresh semantics: a thrown loader during revalidation renders `errorElement`. Existing test `keeps current session content visible when a route refresh fails` codifies that we deliberately swallow refresh failures. Also triggers parent-loader revalidation, ~4× the request volume per save. |
| Derive `clubSlug` from `window.location.pathname` inside `loadCurrentSessionRouteData`. | Duplicates `currentAppClubSlug()` from `shared/api/client.ts`. Hides the data-flow contract — reader of the route file cannot tell that refresh is club-scoped. React Router params are canonical. |
| Loosen `hasOwnProperty("clubSlug")` check in `readmatesApiPath` to fall through when value is `undefined`. | `shared/auth/platform-admin-loader.ts:13` passes `{ clubSlug: undefined }` intentionally to opt out of club scope for platform-admin views. Changing that semantic breaks platform admin. |
| BFF stops forwarding `X-Readmates-Club-Host` for the shared fallback domain. | Correct in principle (host header is meaningful only for custom-domain clubs) but requires environment-aware "is this the shared fallback host" detection in the Pages function, plus parity work in Vite. Wider blast radius for an issue that the client-side fix resolves cleanly. |
| Server returns 4xx when `supplied=true && context=null`. | The same code path legitimately serves "authenticated user who is not a member of the requested club" — for example a logged-in guest navigating to `?clubSlug=other`. Changing status code is invasive and affects unrelated flows. |

## Non-goals

- React Router migration beyond `useParams`.
- BFF host-header policy changes (dev or prod).
- `AuthMeController` response-shape changes.
- Refactoring `loadCurrentSessionRouteData`, `loadMemberAppAuth`, or `readmatesApiPath`.
- Audit/refactor of other routes' refresh patterns (none other shares this dispatcher today; grep confirms).

## Regression test design

Add a unit test to `front/tests/unit/current-session.test.tsx` that:

1. Mounts `CurrentSessionRoute` via `createMemoryRouter` at a **club-scoped path** (`/clubs/:clubSlug/app/session/current`, initial entry `/clubs/reading-sai/app/session/current`). The existing tests mount at `/` and therefore would never catch this bug.
2. Stubs `fetch` to record every URL hit.
3. Asserts the initial loader fetch hit `/api/bff/api/sessions/current?clubSlug=reading-sai`.
4. Dispatches `window.dispatchEvent(new Event("readmates:route-refresh"))`.
5. Waits for the second `/api/sessions/current` fetch.
6. Asserts **every** `/api/sessions/current` request URL contains `clubSlug=reading-sai`.

The test failing pre-fix and passing post-fix is the acceptance criterion.

## Verification

Pre-fix manual repro:
1. Deploy current `main`.
2. Sign in as a member of `reading-sai`.
3. Visit `/clubs/reading-sai/app/session/current`.
4. Adjust reading progress slider, click 저장.
5. Empty state appears.

Post-fix verification:
1. Repeat steps 1-4.
2. Page stays on the session board. Reading progress reflects the saved value. Save status badge shows 저장됨.
3. `pnpm --dir front lint` passes.
4. `pnpm --dir front test` passes — new regression test green, existing "keeps current session visible on refresh failure" still green.
5. `pnpm --dir front build` passes.
6. `pnpm --dir front test:e2e` passes (route + auth + BFF + user-flow change → required per `front/AGENTS.md`).

## Risks and mitigations

| Risk | Mitigation |
|---|---|
| `useParams()` returning `{}` on a hypothetical non-club mount. | `clubSlugFromLoaderArgs({ params: {} })` returns `undefined`, matching today's behavior. The session/current route is always club-scoped in `src/app/router.tsx`. |
| Stale `params` captured by the event listener closure. | `params` added to the `useEffect` dependency array. The listener re-binds when the route's slug changes (e.g., back/forward across clubs without unmount, theoretical but cheap to handle). |
| Other routes silently share the bug. | `grep -r "READMATES_ROUTE_REFRESH_EVENT"` and `grep -r "loadCurrentSessionRouteData("` confirm this is the only call site of the no-arg refresh today. Bug class is local to this file. |
| Server returns 4xx instead of degraded auth in the future. | Defensive `.catch(...)` already preserves last-successful data; future server stricter behavior would only make the path more robust. |

## Out of scope follow-ups (not part of this change)

- **BFF host policy.** A future improvement would be to send `X-Readmates-Club-Host` only when the host is registered as a club domain (i.e., not the shared fallback `readmates.pages.dev`). That removes the implicit-context source entirely. Track separately; not blocked by this fix.
- **Refactor to `useRevalidator`.** Only worth doing alongside an explicit decision to surface refresh failures (e.g., a toast + retry button) instead of silent fallback. Today's UX prefers silent.
- **Audit other routes for the same pattern.** A grep pass when adding the next event-driven refresh consumer would be cheap insurance.
