# Local Frontend Observability BFF Parity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make frontend observability route-load events return 202 through the local Vite BFF proxy while preserving the production Cloudflare/Spring contract and all existing general API proxy behavior.

**Architecture:** Define the browser-facing and Spring-upstream observability paths once in a browser-safe shared module. Let the client and Pages Function consume those constants, expose one pure exact-match rewrite helper for local Vite, and prove the real `browser -> Vite dev proxy -> Spring` boundary with a focused Playwright E2E before running the full frontend/BFF gates.

**Tech Stack:** TypeScript 5.8, Vite 8, React Router 7, Cloudflare Pages Functions, Vitest 4, Playwright, Kotlin/Spring Boot, pnpm 10.33.0 through Corepack.

## Global Constraints

- Keep the browser contract exactly `POST /api/bff/observability/frontend-events`.
- Keep the Spring contract exactly `POST /api/observability/frontend-events`.
- Keep all existing `/api/bff/api/**` Vite rewrite, BFF secret, clubSlug, request-id, cookie, and Origin/Referer behavior unchanged.
- Do not relax Spring CSRF, authorization, BFF secret, or allowed-origin checks.
- Keep telemetry fail-open; do not add retries, persistence, user-facing errors, response masking, or recursive `readmatesFetch` usage.
- Do not add dependencies, server endpoints, DB migrations, OAuth changes, auth-cookie changes, secret configuration changes, or deploy-workflow changes.
- Use the repository-pinned `pnpm@10.33.0` through `npx --yes corepack@0.35.0 pnpm`.
- At execution start, capture the implementation baseline with `IMPLEMENTATION_BASE=$(git rev-parse HEAD)` for final scoped diff checks.

---

## File Structure

- Create `front/shared/observability/frontend-observability-paths.ts`: safe browser/upstream path constants plus the exact local observability rewrite helper.
- Create `front/shared/observability/frontend-observability-paths.test.ts`: pure path, query preservation, and non-match regression tests.
- Modify `front/shared/observability/frontend-observability-client.ts`: consume the shared browser path as its default endpoint.
- Modify `front/shared/observability/frontend-observability-client.test.ts`: prove the default client uses the shared browser contract.
- Modify `front/functions/api/bff/observability/frontend-events.ts`: consume the shared Spring upstream path.
- Modify `front/tests/unit/functions/frontend-observability-bff.test.ts`: assert the Pages Function forwards to the shared upstream contract.
- Modify `front/vite.config.ts`: use the exact observability rewrite helper before the unchanged general `/api/bff` rewrite.
- Create `front/tests/e2e/frontend-observability-local-proxy.spec.ts`: exercise an SPA link navigation through the real Vite and Spring E2E servers.
- Modify `docs/development/architecture.md`: document local Vite parity for the telemetry side path.
- Modify `CHANGELOG.md`: record the local frontend observability proxy repair under Unreleased/Fixed.

---

### Task 1: Extract and adopt the shared observability route contract

**Files:**
- Create: `front/shared/observability/frontend-observability-paths.ts`
- Create: `front/shared/observability/frontend-observability-paths.test.ts`
- Modify: `front/shared/observability/frontend-observability-client.ts:18-24`
- Modify: `front/shared/observability/frontend-observability-client.test.ts:1-70`
- Modify: `front/functions/api/bff/observability/frontend-events.ts:1-85`
- Modify: `front/tests/unit/functions/frontend-observability-bff.test.ts:1-90`

**Interfaces:**
- Consumes: existing browser path `/api/bff/observability/frontend-events` and Spring path `/api/observability/frontend-events`.
- Produces: `FRONTEND_OBSERVABILITY_BROWSER_PATH: "/api/bff/observability/frontend-events"`, `FRONTEND_OBSERVABILITY_UPSTREAM_PATH: "/api/observability/frontend-events"`, and `rewriteFrontendObservabilityProxyPath(proxyPath: string): string | null`.

- [ ] **Step 1: Write the failing shared-path tests**

Create `front/shared/observability/frontend-observability-paths.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import {
  FRONTEND_OBSERVABILITY_BROWSER_PATH,
  FRONTEND_OBSERVABILITY_UPSTREAM_PATH,
  rewriteFrontendObservabilityProxyPath,
} from "./frontend-observability-paths";

describe("frontend observability paths", () => {
  it("rewrites the exact browser path to the Spring upstream path", () => {
    expect(FRONTEND_OBSERVABILITY_BROWSER_PATH).toBe(
      "/api/bff/observability/frontend-events",
    );
    expect(FRONTEND_OBSERVABILITY_UPSTREAM_PATH).toBe(
      "/api/observability/frontend-events",
    );
    expect(
      rewriteFrontendObservabilityProxyPath(
        FRONTEND_OBSERVABILITY_BROWSER_PATH,
      ),
    ).toBe(FRONTEND_OBSERVABILITY_UPSTREAM_PATH);
  });

  it("preserves the query string", () => {
    expect(
      rewriteFrontendObservabilityProxyPath(
        `${FRONTEND_OBSERVABILITY_BROWSER_PATH}?source=route`,
      ),
    ).toBe(`${FRONTEND_OBSERVABILITY_UPSTREAM_PATH}?source=route`);
  });

  it("does not claim general or lookalike BFF paths", () => {
    expect(
      rewriteFrontendObservabilityProxyPath("/api/bff/api/auth/me"),
    ).toBeNull();
    expect(
      rewriteFrontendObservabilityProxyPath(
        "/api/bff/observability/frontend-events/extra",
      ),
    ).toBeNull();
  });
});
```

- [ ] **Step 2: Run the shared-path test and verify RED**

Run:

```bash
npx --yes corepack@0.35.0 pnpm --dir front exec vitest run shared/observability/frontend-observability-paths.test.ts --reporter=dot
```

Expected: FAIL because `./frontend-observability-paths` does not exist.

- [ ] **Step 3: Implement the minimal shared route contract**

Create `front/shared/observability/frontend-observability-paths.ts`:

```ts
export const FRONTEND_OBSERVABILITY_BROWSER_PATH =
  "/api/bff/observability/frontend-events";

export const FRONTEND_OBSERVABILITY_UPSTREAM_PATH =
  "/api/observability/frontend-events";

const LOCAL_PROXY_BASE_URL = "http://readmates.local";

export function rewriteFrontendObservabilityProxyPath(
  proxyPath: string,
): string | null {
  const url = new URL(proxyPath, LOCAL_PROXY_BASE_URL);
  if (url.pathname !== FRONTEND_OBSERVABILITY_BROWSER_PATH) {
    return null;
  }

  return `${FRONTEND_OBSERVABILITY_UPSTREAM_PATH}${url.search}`;
}
```

- [ ] **Step 4: Replace duplicated client and Pages Function paths**

In `front/shared/observability/frontend-observability-client.ts`, import and use the browser constant:

```ts
import { FRONTEND_OBSERVABILITY_BROWSER_PATH } from "./frontend-observability-paths";

const DEFAULT_ENDPOINT = FRONTEND_OBSERVABILITY_BROWSER_PATH;
```

In `front/functions/api/bff/observability/frontend-events.ts`, import and use the upstream constant:

```ts
import { FRONTEND_OBSERVABILITY_UPSTREAM_PATH } from "../../../../shared/observability/frontend-observability-paths";

const upstreamUrl = new URL(
  FRONTEND_OBSERVABILITY_UPSTREAM_PATH,
  apiBaseUrlFromEnv(context.env),
);
```

Do not change request validation, sanitization, BFF secret, Origin/Referer, request-id, body, or response handling.

- [ ] **Step 5: Align existing contract assertions with the shared constants**

In `front/shared/observability/frontend-observability-client.test.ts`, import `FRONTEND_OBSERVABILITY_BROWSER_PATH`, remove the explicit `endpoint` from the first sendBeacon test, and assert the default URL:

```ts
import { FRONTEND_OBSERVABILITY_BROWSER_PATH } from "./frontend-observability-paths";

const client = createFrontendObservabilityClient({
  sendBeacon,
  fetchImpl: vi.fn(),
});

expect(url).toBe(FRONTEND_OBSERVABILITY_BROWSER_PATH);
```

In `front/tests/unit/functions/frontend-observability-bff.test.ts`, import the upstream constant and build the expected URL from it:

```ts
import { FRONTEND_OBSERVABILITY_UPSTREAM_PATH } from "../../../shared/observability/frontend-observability-paths";

expect(url.toString()).toBe(
  `https://api.example.com${FRONTEND_OBSERVABILITY_UPSTREAM_PATH}`,
);
```

- [ ] **Step 6: Run the focused unit tests and verify GREEN**

Run:

```bash
npx --yes corepack@0.35.0 pnpm --dir front exec vitest run \
  shared/observability/frontend-observability-paths.test.ts \
  shared/observability/frontend-observability-client.test.ts \
  tests/unit/functions/frontend-observability-bff.test.ts \
  --reporter=dot
```

Expected: all selected test files PASS; the client still sends an `application/json` Blob and the Pages Function still forwards sanitized JSON to the Spring path.

- [ ] **Step 7: Commit the shared contract**

```bash
git add \
  front/shared/observability/frontend-observability-paths.ts \
  front/shared/observability/frontend-observability-paths.test.ts \
  front/shared/observability/frontend-observability-client.ts \
  front/shared/observability/frontend-observability-client.test.ts \
  front/functions/api/bff/observability/frontend-events.ts \
  front/tests/unit/functions/frontend-observability-bff.test.ts
git commit -m "refactor(front): share observability route contract"
```

---

### Task 2: Prove and repair the real local Vite-to-Spring boundary

**Files:**
- Create: `front/tests/e2e/frontend-observability-local-proxy.spec.ts`
- Modify: `front/vite.config.ts:1-65`
- Test: `front/shared/observability/frontend-observability-paths.test.ts`

**Interfaces:**
- Consumes: `rewriteFrontendObservabilityProxyPath(proxyPath: string): string | null` from Task 1 and Playwright's existing Spring/Vite `webServer` pair.
- Produces: Vite `/api/bff` rewrite behavior that maps the exact telemetry browser path to the Spring upstream path and preserves the unchanged general rewrite for every non-match.

- [ ] **Step 1: Write the failing local proxy E2E**

Create `front/tests/e2e/frontend-observability-local-proxy.spec.ts`:

```ts
import { expect, test } from "@playwright/test";

import { FRONTEND_OBSERVABILITY_BROWSER_PATH } from "../../shared/observability/frontend-observability-paths";

test("local Vite proxy forwards route telemetry to Spring", async ({ page }) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "읽는사이", level: 1 }),
  ).toBeVisible();

  const telemetryResponse = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      url.pathname === FRONTEND_OBSERVABILITY_BROWSER_PATH &&
      response.request().method() === "POST"
    );
  });

  await page
    .getByRole("navigation", { name: "공개 내비게이션" })
    .getByRole("link", { name: "공개 기록" })
    .click();

  await expect(page).toHaveURL(/\/records$/);
  await expect(
    page.getByRole("heading", { name: "공개 기록", level: 1 }),
  ).toBeVisible();

  const response = await telemetryResponse;
  expect(response.status()).toBe(202);

  const body = (await response.json()) as {
    accepted: number;
    dropped: number;
  };
  expect(body.accepted).toBeGreaterThanOrEqual(1);
  expect(body.dropped).toBe(0);
});
```

- [ ] **Step 2: Run the focused E2E and verify RED**

Ensure no manually started server is occupying the configured E2E ports, then run:

```bash
npx --yes corepack@0.35.0 pnpm --dir front test:e2e -- \
  tests/e2e/frontend-observability-local-proxy.spec.ts
```

Expected: FAIL with received status 403. The response path is `/observability/frontend-events`, proving the current Vite rewrite still drops `/api`.

- [ ] **Step 3: Wire the exact rewrite into Vite**

In `front/vite.config.ts`, add the relative import:

```ts
import { rewriteFrontendObservabilityProxyPath } from "./shared/observability/frontend-observability-paths";
```

Replace only the current `/api/bff` rewrite callback:

```ts
rewrite: (proxyPath) =>
  rewriteFrontendObservabilityProxyPath(proxyPath) ??
  proxyPath.replace(/^\/api\/bff/, ""),
```

Do not change `target`, `changeOrigin`, `secure`, configured BFF secret headers, proxy request hooks, clubSlug behavior, OAuth proxies, or aliases.

- [ ] **Step 4: Run the focused E2E and verify GREEN**

Run:

```bash
npx --yes corepack@0.35.0 pnpm --dir front test:e2e -- \
  tests/e2e/frontend-observability-local-proxy.spec.ts
```

Expected: PASS; the SPA reaches `/records`, the telemetry request returns 202, `accepted >= 1`, and `dropped === 0`.

- [ ] **Step 5: Re-run the pure path tests**

Run:

```bash
npx --yes corepack@0.35.0 pnpm --dir front exec vitest run \
  shared/observability/frontend-observability-paths.test.ts \
  --reporter=dot
```

Expected: all exact-match, query-preservation, general-path, and lookalike-path assertions PASS.

- [ ] **Step 6: Commit the local proxy repair**

```bash
git add \
  front/vite.config.ts \
  front/tests/e2e/frontend-observability-local-proxy.spec.ts
git commit -m "fix(front): align local observability proxy path"
```

---

### Task 3: Document the active local observability contract

**Files:**
- Modify: `docs/development/architecture.md:68`
- Modify: `CHANGELOG.md:7-13`

**Interfaces:**
- Consumes: the shared path contract and local Vite behavior completed in Tasks 1-2.
- Produces: active architecture guidance and an Unreleased fix entry without changing historical release notes.

- [ ] **Step 1: Update the active architecture paragraph**

Append these sentences to the frontend runtime observability paragraph in `docs/development/architecture.md`:

```markdown
Local Vite development keeps the same browser path contract and exact-rewrites only this telemetry route to `/api/observability/frontend-events` before forwarding it to Spring. General `/api/bff/api/**` requests continue to use the existing `/api/**` rewrite, so local telemetry parity does not widen the BFF or authorization boundary.
```

- [ ] **Step 2: Add the Unreleased fix entry**

Under `CHANGELOG.md` → `Unreleased` → `Fixed`, add:

```markdown
- **Local frontend observability BFF parity:** the Vite dev proxy now maps `/api/bff/observability/frontend-events` to Spring's `/api/observability/frontend-events` while preserving the production browser contract and the existing general `/api/bff/api/**` rewrite, preventing route navigation from emitting telemetry 403 noise locally.
```

- [ ] **Step 3: Validate the changed documentation**

Run:

```bash
git diff --check -- docs/development/architecture.md CHANGELOG.md
! rg -n "(^|[^A-Za-z0-9_])([o]cid1\\.|/[U]sers/|/[Hh]ome/[^[:space:]]+|[s]k-[A-Za-z0-9]|[g]hp_[A-Za-z0-9]|[g]ithub_pat_|BEGIN (RSA|OPENSSH|PRIVATE) [K]EY)" \
  docs/development/architecture.md CHANGELOG.md
```

Expected: `git diff --check` exits 0; the safety scan prints no matches introduced by this change.

- [ ] **Step 4: Commit the active documentation**

```bash
git add docs/development/architecture.md CHANGELOG.md
git commit -m "docs: document local observability proxy parity"
```

---

### Task 4: Run the complete BFF and frontend verification gates

**Files:**
- Verify: `front/shared/observability/frontend-observability-paths.ts`
- Verify: `front/shared/observability/frontend-observability-client.ts`
- Verify: `front/functions/api/bff/observability/frontend-events.ts`
- Verify: `front/vite.config.ts`
- Verify: `front/tests/e2e/frontend-observability-local-proxy.spec.ts`
- Verify: `docs/development/architecture.md`
- Verify: `CHANGELOG.md`

**Interfaces:**
- Consumes: the completed shared contract, Vite rewrite, E2E regression, and active docs.
- Produces: fresh unit, security, lint, build, full-E2E, and scoped-diff evidence for implementation handoff.

- [ ] **Step 1: Run the focused observability unit tests**

```bash
npx --yes corepack@0.35.0 pnpm --dir front exec vitest run \
  shared/observability/frontend-observability-paths.test.ts \
  shared/observability/frontend-observability-client.test.ts \
  tests/unit/functions/frontend-observability-bff.test.ts \
  src/app/route-observability.test.ts \
  --reporter=dot
```

Expected: all selected tests PASS.

- [ ] **Step 2: Run the Spring observability BFF security test**

```bash
./server/gradlew -p server integrationTest \
  --tests com.readmates.observability.adapter.in.web.FrontendObservabilityBffSecurityTest
```

Expected: PASS for accepted trusted BFF telemetry, 401 without a BFF secret, and 403 without an allowed Origin.

- [ ] **Step 3: Run frontend lint**

```bash
npx --yes corepack@0.35.0 pnpm --dir front lint
```

Expected: exit 0 with no lint errors.

- [ ] **Step 4: Run the full frontend unit suite**

```bash
npx --yes corepack@0.35.0 pnpm --dir front test
```

Expected: all frontend test files and tests PASS.

- [ ] **Step 5: Run the production frontend build**

```bash
npx --yes corepack@0.35.0 pnpm --dir front build
```

Expected: Vite build exits 0 without exposing server-only environment variables in the browser bundle.

- [ ] **Step 6: Run the focused local proxy E2E again**

```bash
npx --yes corepack@0.35.0 pnpm --dir front test:e2e -- \
  tests/e2e/frontend-observability-local-proxy.spec.ts
```

Expected: PASS with a 202 telemetry response after the `/` to `/records` SPA link transition.

- [ ] **Step 7: Run the full frontend E2E suite**

```bash
npx --yes corepack@0.35.0 pnpm --dir front test:e2e
```

Expected: all public, auth, member, host, admin, and BFF user-flow tests PASS.

- [ ] **Step 8: Inspect the final scoped diff and worktree**

```bash
git diff --check "$IMPLEMENTATION_BASE"..HEAD
git diff --stat "$IMPLEMENTATION_BASE"..HEAD
git status --short --branch
```

Expected: no whitespace errors; the scoped diff contains only the approved observability contract, client/Pages adoption, Vite rewrite, tests, architecture note, and CHANGELOG entry; the worktree is clean.

- [ ] **Step 9: Confirm the original symptom is absent in a real browser**

With the normal local backend and frontend environment running, navigate through representative public, member, host, and platform-admin links and inspect failed network requests.

Expected: no `POST /api/bff/observability/frontend-events` 403 responses. Any unrelated 4xx/5xx response must be reported separately rather than attributed to this fix.
