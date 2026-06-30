# ReadMates Frontend Observability v2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add privacy-safe frontend runtime observability for route load, runtime errors, and frontend API failures through the existing BFF/Spring/Micrometer/Grafana path.

**Architecture:** Keep collection lightweight and ReadMates-owned: browser events are normalized in `front/shared/observability`, forwarded through a same-origin Cloudflare Pages Function, recorded as Micrometer metrics in a new Spring `observability` slice, and documented in the existing operations observability docs. UI components must not depend on telemetry directly; app/shared API boundaries emit aggregate events only.

**Tech Stack:** React Router 7, Vite 8, Vitest, Cloudflare Pages Functions, Kotlin/Spring Boot, Micrometer, Prometheus/Grafana JSON dashboards, Markdown docs.

## Global Constraints

- Do not add Sentry, Cloudflare Web Analytics, browser RUM SaaS, OpenTelemetry collector, Loki, ELK, OCI Logging, blackbox uptime checks, or a separate observability VM.
- Do not add frontend event DB persistence, raw stack trace capture, source map upload, full error message storage, session replay, or a new ReadMates SPA admin screen.
- Do not send or store raw URL, query string, club slug value, UUID values, email, display name, account name, membership id, user id, session cookie, OAuth code, BFF secret, request body, response body, feedback document text, provider raw error, VM IP, private domain, OCID, deployment state, or local absolute paths.
- Keep telemetry fail-open: collection failure must not block rendering, navigation, login, host actions, or API calls.
- Keep the frontend dependency direction: `src/app -> src/pages -> features -> shared`; UI components render from props/callbacks and do not call telemetry directly.
- Keep browser-facing traffic on same-origin `/api/bff/**`; no browser-exposed secret or `VITE_*` server secret is allowed.
- Keep server HTTP parsing in `adapter.in.web`, classification in `application.service`, and metric recording behind typed low-cardinality labels.
- Default batch limit is 20 events; unknown route patterns are sent as `unknown`; route load and runtime error SLOs are measurement-start baselines, not hard release gates.

---

## File Structure

- Create `front/shared/observability/frontend-observability-contracts.ts`
  - Owns event unions, allowed enums, batch limits, sanitizers, and `sanitizeFrontendObservabilityEvent`.
- Create `front/shared/observability/route-patterns.ts`
  - Owns `normalizeFrontendRoutePattern(pathname: string): FrontendRoutePattern` and `frontendApiGroupFromPath(path: string): FrontendApiGroup`.
- Create `front/shared/observability/frontend-observability-client.ts`
  - Owns event queueing, `sendBeacon`/`fetch` transport, `createFrontendObservabilityClient`, and no-op failure behavior.
- Create `front/shared/observability/frontend-observability.ts`
  - Owns singleton wiring used by app/API boundaries: `frontendObservability`, `recordFrontendRouteLoad`, `recordFrontendRuntimeError`, and `recordFrontendApiFailure`.
- Create `front/shared/observability/*.test.ts`
  - Unit tests for normalization, sanitization, queueing, transport fallback, and API failure grouping.
- Modify `front/shared/api/client.ts`
  - Records API failure after `ReadmatesApiError` creation and before throwing it.
- Modify `front/shared/ui/route-error.tsx`
  - Records runtime route errors without changing visible fallback UI.
- Create `front/src/app/route-observability.ts`
  - Builds route-load observer helpers and browser event listener registration.
- Create `front/src/app/route-observability.test.ts`
  - Tests route transition timing and unhandled rejection capture without a router-wide E2E.
- Modify `front/src/app/router.tsx`
  - Wraps `createBrowserRouter` subscription for route-load telemetry.
- Create `front/functions/api/bff/observability/frontend-events.ts`
  - Cloudflare Pages Function endpoint for browser telemetry intake.
- Create `front/tests/unit/functions/frontend-observability-bff.test.ts`
  - Tests BFF method/content-type/body-size/header-forwarding/response sanitization behavior.
- Create server files under `server/src/main/kotlin/com/readmates/observability/`
  - `adapter/in/web/FrontendObservabilityController.kt`
  - `application/model/FrontendObservabilityModels.kt`
  - `application/port/in/RecordFrontendObservabilityUseCase.kt`
  - `application/service/FrontendObservabilityMetrics.kt`
  - `application/service/FrontendObservabilityService.kt`
- Create server tests under `server/src/test/kotlin/com/readmates/observability/`
  - `application/service/FrontendObservabilityMetricsTest.kt`
  - `application/service/FrontendObservabilityServiceTest.kt`
  - `adapter/in/web/FrontendObservabilityControllerTest.kt`
- Modify `server/src/test/kotlin/com/readmates/architecture/ServerArchitectureBoundaryTest.kt`
  - Registers the `observability` slice as `OPS_READ`.
- Modify docs and dashboard artifacts:
  - `docs/development/architecture.md`
  - `docs/operations/observability/metrics-catalog.md`
  - `docs/operations/observability/slos.md`
  - `docs/operations/observability/dashboards.md`
  - `docs/operations/runbooks/deploy-observability-check.md`
  - `docs/development/release-readiness-review.md`
  - `CHANGELOG.md`
  - Create `ops/grafana/dashboards/frontend-runtime.json`

---

### Task 1: Frontend Event Contracts And Route Pattern Normalization

**Files:**
- Create: `front/shared/observability/frontend-observability-contracts.ts`
- Create: `front/shared/observability/route-patterns.ts`
- Create: `front/shared/observability/frontend-observability-contracts.test.ts`
- Create: `front/shared/observability/route-patterns.test.ts`

**Interfaces:**
- Consumes: browser `pathname` strings and API paths passed from existing app/API code.
- Produces:
  - `export const FRONTEND_OBSERVABILITY_MAX_EVENTS = 20`
  - `export type FrontendRoutePattern = string`
  - `export type FrontendObservabilityEvent = FrontendRouteLoadEvent | FrontendRuntimeErrorEvent | FrontendApiFailureEvent`
  - `export type FrontendObservabilityBatch = { events: FrontendObservabilityEvent[] }`
  - `export function sanitizeFrontendObservabilityEvent(event: unknown): FrontendObservabilityEvent | null`
  - `export function sanitizeFrontendObservabilityBatch(events: unknown[]): FrontendObservabilityBatch`
  - `export function normalizeFrontendRoutePattern(pathname: string): FrontendRoutePattern`
  - `export function frontendApiGroupFromPath(path: string): FrontendApiGroup`

- [ ] **Step 1: Write failing tests for route normalization**

Create `front/shared/observability/route-patterns.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { frontendApiGroupFromPath, normalizeFrontendRoutePattern } from "./route-patterns";

describe("frontend route observability patterns", () => {
  it("normalizes public member host and admin paths without raw identifiers", () => {
    expect(normalizeFrontendRoutePattern("/clubs/reading-sai/app/session/current")).toBe(
      "/clubs/:slug/app/session/current",
    );
    expect(normalizeFrontendRoutePattern("/clubs/reading-sai/app/host/sessions/123e4567-e89b-12d3-a456-426614174000/edit")).toBe(
      "/clubs/:slug/app/host/sessions/:sessionId/edit",
    );
    expect(normalizeFrontendRoutePattern("/admin/clubs/123e4567-e89b-12d3-a456-426614174000")).toBe(
      "/admin/clubs/:clubId",
    );
    expect(normalizeFrontendRoutePattern("/clubs/reading-sai/sessions/session-7?draft=1#body")).toBe(
      "/clubs/:slug/sessions/:sessionId",
    );
  });

  it("returns unknown for unrecognized or unsafe paths", () => {
    expect(normalizeFrontendRoutePattern("https://readmates.example.com/admin")).toBe("unknown");
    expect(normalizeFrontendRoutePattern("/clubs/reading-sai/private/export")).toBe("unknown");
    expect(normalizeFrontendRoutePattern("/clubs/reading-sai/app/host/sessions/abc/raw-token")).toBe("unknown");
  });

  it("groups API paths without retaining concrete ids or query strings", () => {
    expect(frontendApiGroupFromPath("/api/host/sessions/session-7?clubSlug=reading-sai")).toBe("host-session");
    expect(frontendApiGroupFromPath("/api/host/notifications/items/item-1/retry")).toBe("notification");
    expect(frontendApiGroupFromPath("/api/admin/ai-generation/jobs/job-1")).toBe("admin-ai");
    expect(frontendApiGroupFromPath("/api/public/clubs/reading-sai")).toBe("public");
    expect(frontendApiGroupFromPath("/api/app/me")).toBe("member");
    expect(frontendApiGroupFromPath("/api/unclassified/raw-token")).toBe("unknown");
  });
});
```

- [ ] **Step 2: Run the focused route pattern test and verify it fails**

Run:

```bash
npx --yes pnpm@10.33.0 --dir front test -- route-patterns
```

Expected: FAIL because `front/shared/observability/route-patterns.ts` does not exist.

- [ ] **Step 3: Implement route pattern normalization**

Create `front/shared/observability/route-patterns.ts`:

```ts
export type FrontendRoutePattern = string;

export type FrontendApiGroup =
  | "admin-ai"
  | "admin-audit"
  | "admin-club"
  | "admin-health"
  | "admin-notification"
  | "admin-support"
  | "auth"
  | "feedback"
  | "host-member"
  | "host-notification"
  | "host-session"
  | "member"
  | "notification"
  | "public"
  | "unknown";

type PatternRule = {
  pattern: FrontendRoutePattern;
  regex: RegExp;
};

const routeRules: PatternRule[] = [
  { pattern: "/", regex: /^\/$/ },
  { pattern: "/about", regex: /^\/about\/?$/ },
  { pattern: "/records", regex: /^\/records\/?$/ },
  { pattern: "/sessions/:sessionId", regex: /^\/sessions\/[^/]+\/?$/ },
  { pattern: "/clubs/:slug", regex: /^\/clubs\/[^/]+\/?$/ },
  { pattern: "/clubs/:slug/about", regex: /^\/clubs\/[^/]+\/about\/?$/ },
  { pattern: "/clubs/:slug/records", regex: /^\/clubs\/[^/]+\/records\/?$/ },
  { pattern: "/clubs/:slug/sessions/:sessionId", regex: /^\/clubs\/[^/]+\/sessions\/[^/]+\/?$/ },
  { pattern: "/login", regex: /^\/login\/?$/ },
  { pattern: "/clubs/:slug/invite/:token", regex: /^\/clubs\/[^/]+\/invite\/[^/]+\/?$/ },
  { pattern: "/invite/:token", regex: /^\/invite\/[^/]+\/?$/ },
  { pattern: "/reset-password/:token", regex: /^\/reset-password\/[^/]+\/?$/ },
  { pattern: "/app", regex: /^\/app\/?$/ },
  { pattern: "/app/session/current", regex: /^\/app\/session\/current\/?$/ },
  { pattern: "/app/notes", regex: /^\/app\/notes\/?$/ },
  { pattern: "/app/archive", regex: /^\/app\/archive\/?$/ },
  { pattern: "/app/me", regex: /^\/app\/me\/?$/ },
  { pattern: "/app/notifications", regex: /^\/app\/notifications\/?$/ },
  { pattern: "/app/sessions/:sessionId", regex: /^\/app\/sessions\/[^/]+\/?$/ },
  { pattern: "/app/feedback/:sessionId", regex: /^\/app\/feedback\/[^/]+\/?$/ },
  { pattern: "/app/feedback/:sessionId/print", regex: /^\/app\/feedback\/[^/]+\/print\/?$/ },
  { pattern: "/clubs/:slug/app", regex: /^\/clubs\/[^/]+\/app\/?$/ },
  { pattern: "/clubs/:slug/app/session/current", regex: /^\/clubs\/[^/]+\/app\/session\/current\/?$/ },
  { pattern: "/clubs/:slug/app/notes", regex: /^\/clubs\/[^/]+\/app\/notes\/?$/ },
  { pattern: "/clubs/:slug/app/archive", regex: /^\/clubs\/[^/]+\/app\/archive\/?$/ },
  { pattern: "/clubs/:slug/app/me", regex: /^\/clubs\/[^/]+\/app\/me\/?$/ },
  { pattern: "/clubs/:slug/app/notifications", regex: /^\/clubs\/[^/]+\/app\/notifications\/?$/ },
  { pattern: "/clubs/:slug/app/sessions/:sessionId", regex: /^\/clubs\/[^/]+\/app\/sessions\/[^/]+\/?$/ },
  { pattern: "/clubs/:slug/app/feedback/:sessionId", regex: /^\/clubs\/[^/]+\/app\/feedback\/[^/]+\/?$/ },
  { pattern: "/clubs/:slug/app/feedback/:sessionId/print", regex: /^\/clubs\/[^/]+\/app\/feedback\/[^/]+\/print\/?$/ },
  { pattern: "/app/host", regex: /^\/app\/host\/?$/ },
  { pattern: "/app/host/members", regex: /^\/app\/host\/members\/?$/ },
  { pattern: "/app/host/invitations", regex: /^\/app\/host\/invitations\/?$/ },
  { pattern: "/app/host/notifications", regex: /^\/app\/host\/notifications\/?$/ },
  { pattern: "/app/host/sessions/new", regex: /^\/app\/host\/sessions\/new\/?$/ },
  { pattern: "/app/host/sessions/:sessionId/closing", regex: /^\/app\/host\/sessions\/[^/]+\/closing\/?$/ },
  { pattern: "/app/host/sessions/:sessionId/edit", regex: /^\/app\/host\/sessions\/[^/]+\/edit\/?$/ },
  { pattern: "/clubs/:slug/app/host", regex: /^\/clubs\/[^/]+\/app\/host\/?$/ },
  { pattern: "/clubs/:slug/app/host/members", regex: /^\/clubs\/[^/]+\/app\/host\/members\/?$/ },
  { pattern: "/clubs/:slug/app/host/invitations", regex: /^\/clubs\/[^/]+\/app\/host\/invitations\/?$/ },
  { pattern: "/clubs/:slug/app/host/notifications", regex: /^\/clubs\/[^/]+\/app\/host\/notifications\/?$/ },
  { pattern: "/clubs/:slug/app/host/sessions/new", regex: /^\/clubs\/[^/]+\/app\/host\/sessions\/new\/?$/ },
  { pattern: "/clubs/:slug/app/host/sessions/:sessionId/closing", regex: /^\/clubs\/[^/]+\/app\/host\/sessions\/[^/]+\/closing\/?$/ },
  { pattern: "/clubs/:slug/app/host/sessions/:sessionId/edit", regex: /^\/clubs\/[^/]+\/app\/host\/sessions\/[^/]+\/edit\/?$/ },
  { pattern: "/admin", regex: /^\/admin\/?$/ },
  { pattern: "/admin/today", regex: /^\/admin\/today\/?$/ },
  { pattern: "/admin/health", regex: /^\/admin\/health\/?$/ },
  { pattern: "/admin/notifications", regex: /^\/admin\/notifications\/?$/ },
  { pattern: "/admin/clubs", regex: /^\/admin\/clubs\/?$/ },
  { pattern: "/admin/clubs/:clubId", regex: /^\/admin\/clubs\/[^/]+\/?$/ },
  { pattern: "/admin/support", regex: /^\/admin\/support\/?$/ },
  { pattern: "/admin/ai-ops", regex: /^\/admin\/ai-ops\/?$/ },
  { pattern: "/admin/audit", regex: /^\/admin\/audit\/?$/ },
  { pattern: "/admin/analytics", regex: /^\/admin\/analytics\/?$/ },
];

export function normalizeFrontendRoutePattern(pathname: string): FrontendRoutePattern {
  if (!pathname.startsWith("/")) return "unknown";
  const pathOnly = pathname.split(/[?#]/, 1)[0] || "/";
  const normalized = pathOnly.length > 1 ? pathOnly.replace(/\/+$/, "") : pathOnly;
  return routeRules.find((rule) => rule.regex.test(normalized))?.pattern ?? "unknown";
}

export function frontendApiGroupFromPath(path: string): FrontendApiGroup {
  const pathOnly = path.split(/[?#]/, 1)[0] || "";
  if (pathOnly.startsWith("/api/admin/ai-generation")) return "admin-ai";
  if (pathOnly.startsWith("/api/admin/audit")) return "admin-audit";
  if (pathOnly.startsWith("/api/admin/clubs")) return "admin-club";
  if (pathOnly.startsWith("/api/admin/health")) return "admin-health";
  if (pathOnly.startsWith("/api/admin/notifications")) return "admin-notification";
  if (pathOnly.startsWith("/api/admin/support")) return "admin-support";
  if (pathOnly.startsWith("/api/auth") || pathOnly.includes("/invitations/")) return "auth";
  if (pathOnly.includes("/feedback-document") || pathOnly.startsWith("/api/feedback-documents")) return "feedback";
  if (pathOnly.startsWith("/api/host/members")) return "host-member";
  if (pathOnly.startsWith("/api/host/notifications")) return "host-notification";
  if (pathOnly.startsWith("/api/host/sessions") || pathOnly.startsWith("/api/sessions")) return "host-session";
  if (pathOnly.startsWith("/api/me") || pathOnly.startsWith("/api/app") || pathOnly.startsWith("/api/notes")) return "member";
  if (pathOnly.startsWith("/api/public") || pathOnly.startsWith("/api/archive")) return "public";
  if (pathOnly.includes("/notifications")) return "notification";
  return "unknown";
}
```

- [ ] **Step 4: Write failing tests for event sanitization**

Create `front/shared/observability/frontend-observability-contracts.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  FRONTEND_OBSERVABILITY_MAX_EVENTS,
  sanitizeFrontendObservabilityBatch,
  sanitizeFrontendObservabilityEvent,
} from "./frontend-observability-contracts";

describe("frontend observability event contracts", () => {
  it("keeps only low-cardinality route load fields", () => {
    expect(
      sanitizeFrontendObservabilityEvent({
        type: "ROUTE_LOAD",
        routePattern: "/clubs/:slug/app/session/current",
        durationMs: 420.8,
        navigationType: "PUSH",
        result: "success",
        rawUrl: "/clubs/reading-sai/app/session/current?token=secret",
      }),
    ).toEqual({
      type: "ROUTE_LOAD",
      routePattern: "/clubs/:slug/app/session/current",
      durationMs: 421,
      navigationType: "PUSH",
      result: "success",
    });
  });

  it("sanitizes runtime errors to enum fields and short hashes", () => {
    expect(
      sanitizeFrontendObservabilityEvent({
        type: "RUNTIME_ERROR",
        routePattern: "/admin",
        errorKind: "render",
        errorCode: "REACT_ROUTE_ERROR",
        messageHash: "abcdef1234567890",
        severity: "error",
        stack: "Error: private stack",
        email: "operator@example.com",
      }),
    ).toEqual({
      type: "RUNTIME_ERROR",
      routePattern: "/admin",
      errorKind: "render",
      errorCode: "REACT_ROUTE_ERROR",
      messageHash: "abcdef12",
      severity: "error",
    });
  });

  it("drops invalid or high-cardinality values", () => {
    expect(
      sanitizeFrontendObservabilityEvent({
        type: "API_FAILURE",
        routePattern: "/clubs/reading-sai/app",
        apiGroup: "host-session",
        statusClass: "5xx",
        errorCode: "INTERNAL_ERROR",
      }),
    ).toBeNull();
    expect(
      sanitizeFrontendObservabilityEvent({
        type: "API_FAILURE",
        routePattern: "/clubs/:slug/app",
        apiGroup: "host-session",
        statusClass: "5xx",
        errorCode: "INTERNAL_ERROR",
      }),
    ).toEqual({
      type: "API_FAILURE",
      routePattern: "/clubs/:slug/app",
      apiGroup: "host-session",
      statusClass: "5xx",
      errorCode: "INTERNAL_ERROR",
    });
  });

  it("limits batches to twenty valid events", () => {
    const events = Array.from({ length: FRONTEND_OBSERVABILITY_MAX_EVENTS + 3 }, () => ({
      type: "ROUTE_LOAD",
      routePattern: "/app",
      durationMs: 100,
      navigationType: "POP",
      result: "success",
    }));
    expect(sanitizeFrontendObservabilityBatch(events).events).toHaveLength(FRONTEND_OBSERVABILITY_MAX_EVENTS);
  });
});
```

- [ ] **Step 5: Run the focused contract test and verify it fails**

Run:

```bash
npx --yes pnpm@10.33.0 --dir front test -- frontend-observability-contracts
```

Expected: FAIL because `frontend-observability-contracts.ts` does not exist.

- [ ] **Step 6: Implement event contracts and sanitizers**

Create `front/shared/observability/frontend-observability-contracts.ts`:

```ts
import type { FrontendApiGroup, FrontendRoutePattern } from "./route-patterns";

export const FRONTEND_OBSERVABILITY_MAX_EVENTS = 20;
const MAX_DURATION_MS = 60_000;
const SAFE_CODE = /^[A-Z][A-Z0-9_]{1,63}$/;
const HASH_PREFIX = /^[a-f0-9]{8,64}$/i;

export type FrontendNavigationType = "LOAD" | "PUSH" | "POP" | "REPLACE";
export type FrontendRouteLoadResult = "success" | "error";
export type FrontendRuntimeErrorKind = "render" | "unhandled-rejection" | "unknown";
export type FrontendSeverity = "warn" | "error";
export type FrontendStatusClass = "4xx" | "5xx" | "network" | "unknown";

export type FrontendRouteLoadEvent = {
  type: "ROUTE_LOAD";
  routePattern: FrontendRoutePattern;
  durationMs: number;
  navigationType: FrontendNavigationType;
  result: FrontendRouteLoadResult;
};

export type FrontendRuntimeErrorEvent = {
  type: "RUNTIME_ERROR";
  routePattern: FrontendRoutePattern;
  errorKind: FrontendRuntimeErrorKind;
  errorCode: string;
  messageHash?: string;
  severity: FrontendSeverity;
};

export type FrontendApiFailureEvent = {
  type: "API_FAILURE";
  routePattern: FrontendRoutePattern;
  apiGroup: FrontendApiGroup;
  statusClass: FrontendStatusClass;
  errorCode: string;
};

export type FrontendObservabilityEvent =
  | FrontendRouteLoadEvent
  | FrontendRuntimeErrorEvent
  | FrontendApiFailureEvent;

export type FrontendObservabilityBatch = {
  events: FrontendObservabilityEvent[];
};

const navigationTypes = new Set<FrontendNavigationType>(["LOAD", "PUSH", "POP", "REPLACE"]);
const routeResults = new Set<FrontendRouteLoadResult>(["success", "error"]);
const runtimeKinds = new Set<FrontendRuntimeErrorKind>(["render", "unhandled-rejection", "unknown"]);
const severities = new Set<FrontendSeverity>(["warn", "error"]);
const statusClasses = new Set<FrontendStatusClass>(["4xx", "5xx", "network", "unknown"]);
const apiGroups = new Set<FrontendApiGroup>([
  "admin-ai",
  "admin-audit",
  "admin-club",
  "admin-health",
  "admin-notification",
  "admin-support",
  "auth",
  "feedback",
  "host-member",
  "host-notification",
  "host-session",
  "member",
  "notification",
  "public",
  "unknown",
]);

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function safeRoutePattern(value: unknown): FrontendRoutePattern | null {
  if (typeof value !== "string") return null;
  if (value === "unknown") return value;
  if (!value.startsWith("/")) return null;
  if (/[?#]/.test(value)) return null;
  if (!value.includes(":") && /[0-9a-f]{8}-[0-9a-f-]{27}/i.test(value)) return null;
  if (/\/clubs\/(?!:slug(?:\/|$))[^/]+/.test(value)) return null;
  return value;
}

function safeCode(value: unknown): string | null {
  return typeof value === "string" && SAFE_CODE.test(value) ? value : null;
}

function safeHash(value: unknown): string | undefined {
  return typeof value === "string" && HASH_PREFIX.test(value) ? value.slice(0, 8).toLowerCase() : undefined;
}

function safeDuration(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return Math.max(0, Math.min(MAX_DURATION_MS, Math.round(value)));
}

export function sanitizeFrontendObservabilityEvent(event: unknown): FrontendObservabilityEvent | null {
  const record = asRecord(event);
  if (!record || typeof record.type !== "string") return null;
  const routePattern = safeRoutePattern(record.routePattern);
  if (!routePattern) return null;

  if (record.type === "ROUTE_LOAD") {
    const durationMs = safeDuration(record.durationMs);
    if (durationMs === null) return null;
    const navigationType = record.navigationType as FrontendNavigationType;
    const result = record.result as FrontendRouteLoadResult;
    if (!navigationTypes.has(navigationType) || !routeResults.has(result)) return null;
    return { type: "ROUTE_LOAD", routePattern, durationMs, navigationType, result };
  }

  if (record.type === "RUNTIME_ERROR") {
    const errorKind = record.errorKind as FrontendRuntimeErrorKind;
    const severity = record.severity as FrontendSeverity;
    const errorCode = safeCode(record.errorCode);
    if (!runtimeKinds.has(errorKind) || !severities.has(severity) || !errorCode) return null;
    const messageHash = safeHash(record.messageHash);
    return messageHash
      ? { type: "RUNTIME_ERROR", routePattern, errorKind, errorCode, messageHash, severity }
      : { type: "RUNTIME_ERROR", routePattern, errorKind, errorCode, severity };
  }

  if (record.type === "API_FAILURE") {
    const apiGroup = record.apiGroup as FrontendApiGroup;
    const statusClass = record.statusClass as FrontendStatusClass;
    const errorCode = safeCode(record.errorCode);
    if (!apiGroups.has(apiGroup) || !statusClasses.has(statusClass) || !errorCode) return null;
    return { type: "API_FAILURE", routePattern, apiGroup, statusClass, errorCode };
  }

  return null;
}

export function sanitizeFrontendObservabilityBatch(events: unknown[]): FrontendObservabilityBatch {
  const sanitized: FrontendObservabilityEvent[] = [];
  for (const event of events) {
    const safe = sanitizeFrontendObservabilityEvent(event);
    if (safe) sanitized.push(safe);
    if (sanitized.length >= FRONTEND_OBSERVABILITY_MAX_EVENTS) break;
  }
  return { events: sanitized };
}
```

- [ ] **Step 7: Run focused frontend contract tests**

Run:

```bash
npx --yes pnpm@10.33.0 --dir front test -- route-patterns frontend-observability-contracts
```

Expected: PASS.

- [ ] **Step 8: Commit Task 1**

```bash
git add front/shared/observability/route-patterns.ts front/shared/observability/route-patterns.test.ts front/shared/observability/frontend-observability-contracts.ts front/shared/observability/frontend-observability-contracts.test.ts
git commit -m "feat(front): add frontend observability contracts"
```

---

### Task 2: Frontend Observability Client And API Failure Hook

**Files:**
- Create: `front/shared/observability/frontend-observability-client.ts`
- Create: `front/shared/observability/frontend-observability-client.test.ts`
- Create: `front/shared/observability/frontend-observability.ts`
- Modify: `front/shared/api/client.ts`
- Modify: `front/tests/unit/readmates-fetch.test.ts`

**Interfaces:**
- Consumes:
  - `FrontendObservabilityEvent`
  - `sanitizeFrontendObservabilityBatch(events: unknown[]): FrontendObservabilityBatch`
  - `normalizeFrontendRoutePattern(pathname: string): string`
  - `frontendApiGroupFromPath(path: string): FrontendApiGroup`
- Produces:
  - `export type FrontendObservabilityClient`
  - `export function createFrontendObservabilityClient(options?: FrontendObservabilityClientOptions): FrontendObservabilityClient`
  - `export const frontendObservability: FrontendObservabilityClient`
  - `export function recordFrontendRouteLoad(input: Omit<FrontendRouteLoadEvent, "type" | "routePattern"> & { pathname?: string }): void`
  - `export function recordFrontendRuntimeError(input: { pathname?: string; errorKind: FrontendRuntimeErrorKind; errorCode: string; severity?: FrontendSeverity; message?: string }): void`
  - `export function recordFrontendApiFailure(input: { path: string; status: number; errorCode: string; pathname?: string }): void`

- [ ] **Step 1: Write failing client transport tests**

Create `front/shared/observability/frontend-observability-client.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFrontendObservabilityClient } from "./frontend-observability-client";

describe("frontend observability client", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("flushes sanitized batches with sendBeacon", async () => {
    const sendBeacon = vi.fn(() => true);
    const client = createFrontendObservabilityClient({
      endpoint: "/api/bff/observability/frontend-events",
      sendBeacon,
      fetchImpl: vi.fn(),
    });

    client.record({
      type: "ROUTE_LOAD",
      routePattern: "/app",
      durationMs: 42,
      navigationType: "LOAD",
      result: "success",
    });
    await client.flush();

    expect(sendBeacon).toHaveBeenCalledTimes(1);
    const [url, body] = sendBeacon.mock.calls[0];
    expect(url).toBe("/api/bff/observability/frontend-events");
    expect(JSON.parse(body as string)).toEqual({
      events: [
        {
          type: "ROUTE_LOAD",
          routePattern: "/app",
          durationMs: 42,
          navigationType: "LOAD",
          result: "success",
        },
      ],
    });
  });

  it("falls back to keepalive fetch when sendBeacon fails", async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 202 }));
    const client = createFrontendObservabilityClient({
      endpoint: "/api/bff/observability/frontend-events",
      sendBeacon: vi.fn(() => false),
      fetchImpl,
    });

    client.record({
      type: "API_FAILURE",
      routePattern: "/clubs/:slug/app",
      apiGroup: "host-session",
      statusClass: "5xx",
      errorCode: "INTERNAL_ERROR",
    });
    await client.flush();

    expect(fetchImpl).toHaveBeenCalledWith(
      "/api/bff/observability/frontend-events",
      expect.objectContaining({
        method: "POST",
        keepalive: true,
        headers: { "Content-Type": "application/json" },
      }),
    );
  });

  it("drops invalid events and never throws from flush", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error("network blocked");
    });
    const client = createFrontendObservabilityClient({
      endpoint: "/api/bff/observability/frontend-events",
      sendBeacon: undefined,
      fetchImpl,
    });

    client.record({ type: "ROUTE_LOAD", routePattern: "/clubs/raw-slug/app", durationMs: 1, navigationType: "LOAD", result: "success" });
    client.record({
      type: "RUNTIME_ERROR",
      routePattern: "/admin",
      errorKind: "render",
      errorCode: "REACT_ROUTE_ERROR",
      severity: "error",
    });

    await expect(client.flush()).resolves.toBeUndefined();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(client.pendingCount()).toBe(0);
  });
});
```

- [ ] **Step 2: Run the focused client test and verify it fails**

Run:

```bash
npx --yes pnpm@10.33.0 --dir front test -- frontend-observability-client
```

Expected: FAIL because `frontend-observability-client.ts` does not exist.

- [ ] **Step 3: Implement the client**

Create `front/shared/observability/frontend-observability-client.ts`:

```ts
import {
  type FrontendObservabilityEvent,
  sanitizeFrontendObservabilityBatch,
} from "./frontend-observability-contracts";

export type FrontendObservabilityClient = {
  record(event: FrontendObservabilityEvent): void;
  flush(): Promise<void>;
  pendingCount(): number;
};

export type FrontendObservabilityClientOptions = {
  endpoint?: string;
  sendBeacon?: ((url: string, data: string) => boolean) | undefined;
  fetchImpl?: typeof fetch | undefined;
};

const DEFAULT_ENDPOINT = "/api/bff/observability/frontend-events";
const MAX_QUEUE_SIZE = 60;

export function createFrontendObservabilityClient(options: FrontendObservabilityClientOptions = {}): FrontendObservabilityClient {
  const endpoint = options.endpoint ?? DEFAULT_ENDPOINT;
  const queue: FrontendObservabilityEvent[] = [];

  const sendBeacon =
    options.sendBeacon ??
    (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function"
      ? (url: string, data: string) => navigator.sendBeacon(url, data)
      : undefined);
  const fetchImpl = options.fetchImpl ?? (typeof fetch === "function" ? fetch : undefined);

  function record(event: FrontendObservabilityEvent) {
    const safe = sanitizeFrontendObservabilityBatch([event]).events[0];
    if (!safe) return;
    queue.push(safe);
    if (queue.length > MAX_QUEUE_SIZE) {
      queue.splice(0, queue.length - MAX_QUEUE_SIZE);
    }
  }

  async function flush() {
    if (queue.length === 0) return;
    const batch = sanitizeFrontendObservabilityBatch(queue.splice(0, queue.length));
    if (batch.events.length === 0) return;
    const body = JSON.stringify(batch);

    try {
      if (sendBeacon?.(endpoint, body)) {
        return;
      }
      if (fetchImpl) {
        await fetchImpl(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body,
          keepalive: true,
          cache: "no-store",
        });
      }
    } catch {
      // Telemetry must never affect product flows.
    }
  }

  return {
    record,
    flush,
    pendingCount: () => queue.length,
  };
}
```

- [ ] **Step 4: Implement singleton helpers**

Create `front/shared/observability/frontend-observability.ts`:

```ts
import {
  type FrontendNavigationType,
  type FrontendRouteLoadResult,
  type FrontendRuntimeErrorKind,
  type FrontendSeverity,
  type FrontendStatusClass,
} from "./frontend-observability-contracts";
import { createFrontendObservabilityClient } from "./frontend-observability-client";
import { frontendApiGroupFromPath, normalizeFrontendRoutePattern } from "./route-patterns";

export const frontendObservability = createFrontendObservabilityClient();

function currentPathname(pathname?: string): string {
  if (pathname) return pathname;
  if (typeof globalThis.location?.pathname === "string") return globalThis.location.pathname;
  return "/";
}

function statusClass(status: number): FrontendStatusClass {
  if (status >= 500) return "5xx";
  if (status >= 400) return "4xx";
  return "unknown";
}

function safeErrorCode(errorCode: string): string {
  return /^[A-Z][A-Z0-9_]{1,63}$/.test(errorCode) ? errorCode : "UNKNOWN_ERROR";
}

async function hashPrefix(value: string): Promise<string | undefined> {
  if (!value || typeof crypto === "undefined" || !crypto.subtle) return undefined;
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 8);
}

export function recordFrontendRouteLoad(input: {
  pathname?: string;
  durationMs: number;
  navigationType: FrontendNavigationType;
  result: FrontendRouteLoadResult;
}) {
  frontendObservability.record({
    type: "ROUTE_LOAD",
    routePattern: normalizeFrontendRoutePattern(currentPathname(input.pathname)),
    durationMs: input.durationMs,
    navigationType: input.navigationType,
    result: input.result,
  });
  void frontendObservability.flush();
}

export function recordFrontendRuntimeError(input: {
  pathname?: string;
  errorKind: FrontendRuntimeErrorKind;
  errorCode: string;
  severity?: FrontendSeverity;
  message?: string;
}) {
  const routePattern = normalizeFrontendRoutePattern(currentPathname(input.pathname));
  void hashPrefix(input.message ?? "").then((messageHash) => {
    frontendObservability.record({
      type: "RUNTIME_ERROR",
      routePattern,
      errorKind: input.errorKind,
      errorCode: safeErrorCode(input.errorCode),
      ...(messageHash ? { messageHash } : {}),
      severity: input.severity ?? "error",
    });
    void frontendObservability.flush();
  });
}

export function recordFrontendApiFailure(input: {
  path: string;
  status: number;
  errorCode: string;
  pathname?: string;
}) {
  frontendObservability.record({
    type: "API_FAILURE",
    routePattern: normalizeFrontendRoutePattern(currentPathname(input.pathname)),
    apiGroup: frontendApiGroupFromPath(input.path),
    statusClass: statusClass(input.status),
    errorCode: safeErrorCode(input.errorCode),
  });
  void frontendObservability.flush();
}
```

- [ ] **Step 5: Add API failure hook test**

Modify `front/tests/unit/readmates-fetch.test.ts` by adding this import near the top:

```ts
import { frontendObservability } from "@/shared/observability/frontend-observability";
```

Add this test near existing non-OK `readmatesFetch` tests:

```ts
it("records frontend API failure telemetry with safe path grouping", async () => {
  const recordSpy = vi.spyOn(frontendObservability, "record");
  const flushSpy = vi.spyOn(frontendObservability, "flush").mockResolvedValue(undefined);
  fetchMock.mockResolvedValue(
    new Response(JSON.stringify({ code: "INTERNAL_ERROR", message: "server failed", status: 500 }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    }),
  );

  await expect(readmatesFetch("/api/host/sessions/session-7?clubSlug=reading-sai")).rejects.toMatchObject({
    code: "INTERNAL_ERROR",
  });

  expect(recordSpy).toHaveBeenCalledWith({
    type: "API_FAILURE",
    routePattern: expect.any(String),
    apiGroup: "host-session",
    statusClass: "5xx",
    errorCode: "INTERNAL_ERROR",
  });
  expect(JSON.stringify(recordSpy.mock.calls)).not.toContain("reading-sai");
  expect(JSON.stringify(recordSpy.mock.calls)).not.toContain("session-7");
  expect(flushSpy).toHaveBeenCalled();
});
```

- [ ] **Step 6: Run the API hook test and verify it fails**

Run:

```bash
npx --yes pnpm@10.33.0 --dir front test -- readmates-fetch
```

Expected: FAIL because `readmatesFetch` does not record telemetry yet.

- [ ] **Step 7: Wire API failure hook**

Modify `front/shared/api/client.ts` by adding the import:

```ts
import { recordFrontendApiFailure } from "@/shared/observability/frontend-observability";
```

Replace the non-OK block in `readmatesFetch`:

```ts
  if (!response.ok) {
    throw await apiErrorFromResponse(response);
  }
```

with:

```ts
  if (!response.ok) {
    const error = await apiErrorFromResponse(response);
    recordFrontendApiFailure({ path, status: error.status, errorCode: error.code });
    throw error;
  }
```

- [ ] **Step 8: Run focused frontend tests**

Run:

```bash
npx --yes pnpm@10.33.0 --dir front test -- frontend-observability-client readmates-fetch
```

Expected: PASS.

- [ ] **Step 9: Commit Task 2**

```bash
git add front/shared/observability/frontend-observability-client.ts front/shared/observability/frontend-observability-client.test.ts front/shared/observability/frontend-observability.ts front/shared/api/client.ts front/tests/unit/readmates-fetch.test.ts
git commit -m "feat(front): record safe frontend API failures"
```

---

### Task 3: BFF Frontend Telemetry Intake

**Files:**
- Create: `front/functions/api/bff/observability/frontend-events.ts`
- Create: `front/tests/unit/functions/frontend-observability-bff.test.ts`

**Interfaces:**
- Consumes: browser POST body shaped as `FrontendObservabilityBatch`.
- Produces: Cloudflare Pages `onRequest` function forwarding to Spring `POST /api/observability/frontend-events`.

- [ ] **Step 1: Write failing BFF endpoint tests**

Create `front/tests/unit/functions/frontend-observability-bff.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { onRequest } from "../../../functions/api/bff/observability/frontend-events";

const env = {
  READMATES_API_BASE_URL: "https://api.example.com",
  READMATES_BFF_SECRET: "test-bff-secret",
};

function context(request: Request, waitUntil = vi.fn()) {
  return { request, env, params: {}, waitUntil };
}

describe("frontend observability BFF endpoint", () => {
  it("rejects non-POST and non-JSON requests", async () => {
    const getResponse = await onRequest(context(new Request("https://readmates.example.com/api/bff/observability/frontend-events")));
    expect(getResponse.status).toBe(405);

    const textResponse = await onRequest(
      context(new Request("https://readmates.example.com/api/bff/observability/frontend-events", { method: "POST", body: "x" })),
    );
    expect(textResponse.status).toBe(415);
  });

  it("forwards sanitized JSON with BFF secret and strips browser internal headers", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ accepted: 1, dropped: 0 }), {
        status: 202,
        headers: {
          "Content-Type": "application/json",
          "X-Readmates-Bff-Secret": "must-not-return",
          "X-Readmates-Club-Slug": "must-not-return",
        },
      }),
    );

    const response = await onRequest(
      context(
        new Request("https://readmates.example.com/api/bff/observability/frontend-events", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Origin": "https://readmates.example.com",
            "X-Readmates-Bff-Secret": "browser-secret",
            "X-Readmates-Club-Slug": "browser-club",
          },
          body: JSON.stringify({
            events: [
              {
                type: "ROUTE_LOAD",
                routePattern: "/clubs/:slug/app",
                durationMs: 100,
                navigationType: "LOAD",
                result: "success",
              },
            ],
          }),
        }),
      ),
    );

    expect(response.status).toBe(202);
    expect(response.headers.get("X-Readmates-Bff-Secret")).toBeNull();
    expect(response.headers.get("X-Readmates-Club-Slug")).toBeNull();

    const [url, init] = fetchMock.mock.calls[0];
    expect(url.toString()).toBe("https://api.example.com/api/observability/frontend-events");
    const headers = init?.headers as Headers;
    expect(headers.get("X-Readmates-Bff-Secret")).toBe("test-bff-secret");
    expect(headers.get("X-Readmates-Club-Slug")).toBeNull();
    expect(init?.method).toBe("POST");
    expect(JSON.parse(init?.body as string).events).toHaveLength(1);
  });

  it("returns 413 for oversized payloads before forwarding", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 202 }));
    const response = await onRequest(
      context(
        new Request("https://readmates.example.com/api/bff/observability/frontend-events", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ events: [], padding: "x".repeat(16_500) }),
        }),
      ),
    );

    expect(response.status).toBe(413);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the BFF test and verify it fails**

Run:

```bash
npx --yes pnpm@10.33.0 --dir front test -- frontend-observability-bff
```

Expected: FAIL because `front/functions/api/bff/observability/frontend-events.ts` does not exist.

- [ ] **Step 3: Implement the BFF endpoint**

Create `front/functions/api/bff/observability/frontend-events.ts`:

```ts
import { bffErrorResponse } from "../../../_shared/errors";
import {
  apiBaseUrlFromEnv,
  bffSecretFromEnv,
  copyUpstreamHeaders,
  requestIdForUpstream,
  READMATES_REQUEST_ID_HEADER,
} from "../../../_shared/proxy";
import { sanitizeFrontendObservabilityBatch } from "../../../../shared/observability/frontend-observability-contracts";

type Env = {
  READMATES_API_BASE_URL: string;
  READMATES_BFF_SECRET?: string;
  READMATES_BFF_SECRETS?: string;
};

type PagesFunction<Env> = (context: {
  request: Request;
  env: Env;
  params: Record<string, string | string[] | undefined>;
  waitUntil: (promise: Promise<unknown>) => void;
}) => Response | Promise<Response>;

const MAX_BODY_BYTES = 16 * 1024;

function jsonResponse(body: unknown, status = 202, headers = new Headers()) {
  const outbound = new Response(JSON.stringify(body), {
    status,
    headers: copyUpstreamHeaders(headers),
  });
  outbound.headers.set("Content-Type", "application/json; charset=utf-8");
  outbound.headers.set("Cache-Control", "no-store");
  return outbound;
}

export const onRequest: PagesFunction<Env> = async (context) => {
  if (context.request.method !== "POST") {
    return bffErrorResponse(405, "METHOD_NOT_ALLOWED", "지원하지 않는 요청입니다.");
  }

  const contentType = context.request.headers.get("content-type")?.toLowerCase() ?? "";
  if (!contentType.includes("application/json")) {
    return bffErrorResponse(415, "UNSUPPORTED_MEDIA_TYPE", "JSON 요청만 지원합니다.");
  }

  const body = await context.request.text();
  if (new TextEncoder().encode(body).byteLength > MAX_BODY_BYTES) {
    return bffErrorResponse(413, "PAYLOAD_TOO_LARGE", "요청 본문이 너무 큽니다.");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return bffErrorResponse(400, "INVALID_REQUEST", "요청을 처리할 수 없습니다.");
  }

  const rawEvents =
    parsed && typeof parsed === "object" && Array.isArray((parsed as { events?: unknown }).events)
      ? (parsed as { events: unknown[] }).events
      : [];
  const sanitized = sanitizeFrontendObservabilityBatch(rawEvents);

  const upstreamUrl = new URL("/api/observability/frontend-events", apiBaseUrlFromEnv(context.env));
  const headers = new Headers();
  headers.set("Content-Type", "application/json");
  headers.set(READMATES_REQUEST_ID_HEADER, requestIdForUpstream(context.request));

  const bffSecret = bffSecretFromEnv(context.env);
  if (bffSecret) {
    headers.set("X-Readmates-Bff-Secret", bffSecret);
  }

  const upstream = await fetch(upstreamUrl.toString(), {
    method: "POST",
    headers,
    body: JSON.stringify(sanitized),
    redirect: "manual",
  });

  const responseText = await upstream.text();
  let responseBody: unknown = { accepted: upstream.ok ? 1 : 0, dropped: 0 };
  if (responseText.trim()) {
    try {
      responseBody = JSON.parse(responseText);
    } catch {
      responseBody = { accepted: 0, dropped: 0 };
    }
  }

  return jsonResponse(responseBody, upstream.status, upstream.headers);
};
```

- [ ] **Step 4: Run focused BFF tests**

Run:

```bash
npx --yes pnpm@10.33.0 --dir front test -- frontend-observability-bff proxy-bff-secret
```

Expected: PASS.

- [ ] **Step 5: Commit Task 3**

```bash
git add front/functions/api/bff/observability/frontend-events.ts front/tests/unit/functions/frontend-observability-bff.test.ts
git commit -m "feat(bff): add frontend observability intake"
```

---

### Task 4: Spring Frontend Observability Intake And Metrics

**Files:**
- Create: `server/src/main/kotlin/com/readmates/observability/application/model/FrontendObservabilityModels.kt`
- Create: `server/src/main/kotlin/com/readmates/observability/application/port/in/RecordFrontendObservabilityUseCase.kt`
- Create: `server/src/main/kotlin/com/readmates/observability/application/service/FrontendObservabilityMetrics.kt`
- Create: `server/src/main/kotlin/com/readmates/observability/application/service/FrontendObservabilityService.kt`
- Create: `server/src/main/kotlin/com/readmates/observability/adapter/in/web/FrontendObservabilityController.kt`
- Create: `server/src/test/kotlin/com/readmates/observability/application/service/FrontendObservabilityMetricsTest.kt`
- Create: `server/src/test/kotlin/com/readmates/observability/application/service/FrontendObservabilityServiceTest.kt`
- Create: `server/src/test/kotlin/com/readmates/observability/adapter/in/web/FrontendObservabilityControllerTest.kt`
- Modify: `server/src/test/kotlin/com/readmates/architecture/ServerArchitectureBoundaryTest.kt`

**Interfaces:**
- Consumes: BFF-protected `POST /api/observability/frontend-events`.
- Produces:
  - `FrontendObservabilityEvent` sealed interface.
  - `RecordFrontendObservabilityUseCase.record(events: List<FrontendObservabilityEvent>): FrontendObservabilityResult`.
  - Micrometer metrics named in the spec.

- [ ] **Step 1: Write failing metrics tests**

Create `server/src/test/kotlin/com/readmates/observability/application/service/FrontendObservabilityMetricsTest.kt`:

```kotlin
package com.readmates.observability.application.service

import io.micrometer.core.instrument.simple.SimpleMeterRegistry
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import java.time.Duration
import java.util.concurrent.TimeUnit

class FrontendObservabilityMetricsTest {
    @Test
    fun `route load records timer with safe labels only`() {
        val registry = SimpleMeterRegistry()
        val metrics = FrontendObservabilityMetrics(registry)

        metrics.recordRouteLoad("/clubs/:slug/app", "success", "LOAD", Duration.ofMillis(1250))

        val timer =
            registry
                .find("readmates.frontend.route_load")
                .tag("route_pattern", "/clubs/:slug/app")
                .tag("result", "success")
                .tag("navigation_type", "LOAD")
                .timer()

        assertThat(timer).isNotNull
        assertThat(timer!!.count()).isEqualTo(1)
        assertThat(timer.totalTime(TimeUnit.MILLISECONDS)).isEqualTo(1250.0)
        assertThat(timer.id.tags.map { it.key }).containsExactlyInAnyOrder("route_pattern", "result", "navigation_type")
    }

    @Test
    fun `runtime api and dropped counters use allowlisted tag names`() {
        val registry = SimpleMeterRegistry()
        val metrics = FrontendObservabilityMetrics(registry)

        metrics.recordRuntimeError("/admin", "render", "REACT_ROUTE_ERROR", "error")
        metrics.recordApiFailure("/clubs/:slug/app", "host-session", "5xx", "INTERNAL_ERROR")
        metrics.recordDropped("invalid_route_pattern")

        assertThat(registry.counter("readmates.frontend.runtime_errors", "route_pattern", "/admin", "error_kind", "render", "error_code", "REACT_ROUTE_ERROR", "severity", "error").count()).isEqualTo(1.0)
        assertThat(registry.counter("readmates.frontend.api_failures", "route_pattern", "/clubs/:slug/app", "api_group", "host-session", "status_class", "5xx", "error_code", "INTERNAL_ERROR").count()).isEqualTo(1.0)
        assertThat(registry.counter("readmates.frontend.observability.dropped", "reason", "invalid_route_pattern").count()).isEqualTo(1.0)
        assertThat(registry.meters.flatMap { meter -> meter.id.tags.map { it.key } })
            .doesNotContain("email", "user_id", "club_id", "session_id", "url", "message", "stack")
    }
}
```

- [ ] **Step 2: Run metrics tests and verify they fail**

Run:

```bash
./server/gradlew -p server unitTest --tests com.readmates.observability.application.service.FrontendObservabilityMetricsTest
```

Expected: FAIL because `FrontendObservabilityMetrics` does not exist.

- [ ] **Step 3: Implement models, port, metrics, and service**

Create `server/src/main/kotlin/com/readmates/observability/application/model/FrontendObservabilityModels.kt`:

```kotlin
package com.readmates.observability.application.model

import java.time.Duration

sealed interface FrontendObservabilityEvent {
    val routePattern: String
}

data class FrontendRouteLoadEvent(
    override val routePattern: String,
    val duration: Duration,
    val navigationType: String,
    val result: String,
) : FrontendObservabilityEvent

data class FrontendRuntimeErrorEvent(
    override val routePattern: String,
    val errorKind: String,
    val errorCode: String,
    val severity: String,
) : FrontendObservabilityEvent

data class FrontendApiFailureEvent(
    override val routePattern: String,
    val apiGroup: String,
    val statusClass: String,
    val errorCode: String,
) : FrontendObservabilityEvent

data class FrontendObservabilityResult(
    val accepted: Int,
    val dropped: Int,
)
```

Create `server/src/main/kotlin/com/readmates/observability/application/port/in/RecordFrontendObservabilityUseCase.kt`:

```kotlin
package com.readmates.observability.application.port.`in`

import com.readmates.observability.application.model.FrontendObservabilityEvent
import com.readmates.observability.application.model.FrontendObservabilityResult

interface RecordFrontendObservabilityUseCase {
    fun record(events: List<FrontendObservabilityEvent>): FrontendObservabilityResult
}
```

Create `server/src/main/kotlin/com/readmates/observability/application/service/FrontendObservabilityMetrics.kt`:

```kotlin
package com.readmates.observability.application.service

import io.micrometer.core.instrument.Counter
import io.micrometer.core.instrument.MeterRegistry
import io.micrometer.core.instrument.Tag
import io.micrometer.core.instrument.Tags
import io.micrometer.core.instrument.Timer
import org.springframework.stereotype.Component
import java.time.Duration

@Component
class FrontendObservabilityMetrics(
    private val meterRegistry: MeterRegistry,
) {
    fun recordRouteLoad(
        routePattern: String,
        result: String,
        navigationType: String,
        duration: Duration,
    ) {
        Timer
            .builder("readmates.frontend.route_load")
            .description("Browser route load duration")
            .publishPercentileHistogram(true)
            .tags(
                frontendTags(
                    FrontendMetricLabel.ROUTE_PATTERN to routePattern,
                    FrontendMetricLabel.RESULT to result,
                    FrontendMetricLabel.NAVIGATION_TYPE to navigationType,
                ),
            ).register(meterRegistry)
            .record(duration)
    }

    fun recordRuntimeError(
        routePattern: String,
        errorKind: String,
        errorCode: String,
        severity: String,
    ) {
        Counter
            .builder("readmates.frontend.runtime_errors")
            .description("Browser runtime errors by route and class")
            .tags(
                frontendTags(
                    FrontendMetricLabel.ROUTE_PATTERN to routePattern,
                    FrontendMetricLabel.ERROR_KIND to errorKind,
                    FrontendMetricLabel.ERROR_CODE to errorCode,
                    FrontendMetricLabel.SEVERITY to severity,
                ),
            ).register(meterRegistry)
            .increment()
    }

    fun recordApiFailure(
        routePattern: String,
        apiGroup: String,
        statusClass: String,
        errorCode: String,
    ) {
        Counter
            .builder("readmates.frontend.api_failures")
            .description("Frontend-observed API failures by route and API group")
            .tags(
                frontendTags(
                    FrontendMetricLabel.ROUTE_PATTERN to routePattern,
                    FrontendMetricLabel.API_GROUP to apiGroup,
                    FrontendMetricLabel.STATUS_CLASS to statusClass,
                    FrontendMetricLabel.ERROR_CODE to errorCode,
                ),
            ).register(meterRegistry)
            .increment()
    }

    fun recordDropped(reason: String) {
        Counter
            .builder("readmates.frontend.observability.dropped")
            .description("Dropped frontend telemetry events by low-cardinality reason")
            .tags(frontendTags(FrontendMetricLabel.REASON to reason))
            .register(meterRegistry)
            .increment()
    }

    private fun frontendTags(vararg labels: Pair<FrontendMetricLabel, String>): Tags =
        Tags.of(labels.map { (label, value) -> Tag.of(label.tagKey, value) })
}

private enum class FrontendMetricLabel(
    val tagKey: String,
) {
    ROUTE_PATTERN("route_pattern"),
    RESULT("result"),
    NAVIGATION_TYPE("navigation_type"),
    ERROR_KIND("error_kind"),
    ERROR_CODE("error_code"),
    SEVERITY("severity"),
    API_GROUP("api_group"),
    STATUS_CLASS("status_class"),
    REASON("reason"),
}
```

Create `server/src/main/kotlin/com/readmates/observability/application/service/FrontendObservabilityService.kt`:

```kotlin
package com.readmates.observability.application.service

import com.readmates.observability.application.model.FrontendApiFailureEvent
import com.readmates.observability.application.model.FrontendObservabilityEvent
import com.readmates.observability.application.model.FrontendObservabilityResult
import com.readmates.observability.application.model.FrontendRouteLoadEvent
import com.readmates.observability.application.model.FrontendRuntimeErrorEvent
import com.readmates.observability.application.port.`in`.RecordFrontendObservabilityUseCase
import org.springframework.stereotype.Service

@Service
class FrontendObservabilityService(
    private val metrics: FrontendObservabilityMetrics,
) : RecordFrontendObservabilityUseCase {
    override fun record(events: List<FrontendObservabilityEvent>): FrontendObservabilityResult {
        var accepted = 0
        for (event in events) {
            when (event) {
                is FrontendRouteLoadEvent -> {
                    metrics.recordRouteLoad(event.routePattern, event.result, event.navigationType, event.duration)
                    accepted += 1
                }
                is FrontendRuntimeErrorEvent -> {
                    metrics.recordRuntimeError(event.routePattern, event.errorKind, event.errorCode, event.severity)
                    accepted += 1
                }
                is FrontendApiFailureEvent -> {
                    metrics.recordApiFailure(event.routePattern, event.apiGroup, event.statusClass, event.errorCode)
                    accepted += 1
                }
            }
        }
        return FrontendObservabilityResult(accepted = accepted, dropped = 0)
    }
}
```

- [ ] **Step 4: Run metrics tests**

Run:

```bash
./server/gradlew -p server unitTest --tests com.readmates.observability.application.service.FrontendObservabilityMetricsTest
```

Expected: PASS.

- [ ] **Step 5: Write service tests**

Create `server/src/test/kotlin/com/readmates/observability/application/service/FrontendObservabilityServiceTest.kt`:

```kotlin
package com.readmates.observability.application.service

import com.readmates.observability.application.model.FrontendApiFailureEvent
import com.readmates.observability.application.model.FrontendRouteLoadEvent
import com.readmates.observability.application.model.FrontendRuntimeErrorEvent
import io.micrometer.core.instrument.simple.SimpleMeterRegistry
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import java.time.Duration

class FrontendObservabilityServiceTest {
    @Test
    fun `records every supported frontend event and returns accepted count`() {
        val registry = SimpleMeterRegistry()
        val service = FrontendObservabilityService(FrontendObservabilityMetrics(registry))

        val result =
            service.record(
                listOf(
                    FrontendRouteLoadEvent("/app", Duration.ofMillis(80), "LOAD", "success"),
                    FrontendRuntimeErrorEvent("/admin", "render", "REACT_ROUTE_ERROR", "error"),
                    FrontendApiFailureEvent("/clubs/:slug/app", "host-session", "5xx", "INTERNAL_ERROR"),
                ),
            )

        assertThat(result.accepted).isEqualTo(3)
        assertThat(result.dropped).isZero()
        assertThat(registry.find("readmates.frontend.route_load").timer()?.count()).isEqualTo(1)
        assertThat(registry.counter("readmates.frontend.runtime_errors", "route_pattern", "/admin", "error_kind", "render", "error_code", "REACT_ROUTE_ERROR", "severity", "error").count()).isEqualTo(1.0)
        assertThat(registry.counter("readmates.frontend.api_failures", "route_pattern", "/clubs/:slug/app", "api_group", "host-session", "status_class", "5xx", "error_code", "INTERNAL_ERROR").count()).isEqualTo(1.0)
    }
}
```

- [ ] **Step 6: Run service tests**

Run:

```bash
./server/gradlew -p server unitTest --tests com.readmates.observability.application.service.FrontendObservabilityServiceTest
```

Expected: PASS.

- [ ] **Step 7: Write controller tests**

Create `server/src/test/kotlin/com/readmates/observability/adapter/in/web/FrontendObservabilityControllerTest.kt`:

```kotlin
package com.readmates.observability.adapter.`in`.web

import com.readmates.observability.application.model.FrontendObservabilityResult
import com.readmates.observability.application.port.`in`.RecordFrontendObservabilityUseCase
import org.junit.jupiter.api.Test
import org.mockito.ArgumentMatchers.anyList
import org.mockito.Mockito.mock
import org.mockito.Mockito.`when`
import org.mockito.Mockito.verify
import org.springframework.http.MediaType
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.post
import org.springframework.test.web.servlet.setup.MockMvcBuilders

class FrontendObservabilityControllerTest {
    private val useCase = mock(RecordFrontendObservabilityUseCase::class.java)
    private val mockMvc: MockMvc =
        MockMvcBuilders
            .standaloneSetup(FrontendObservabilityController(useCase))
            .build()

    @Test
    fun `accepts frontend telemetry batch and maps route load event`() {
        `when`(useCase.record(anyList())).thenReturn(FrontendObservabilityResult(accepted = 1, dropped = 0))

        mockMvc
            .post("/api/observability/frontend-events") {
                contentType = MediaType.APPLICATION_JSON
                content =
                    """
                    {
                      "events": [
                        {
                          "type": "ROUTE_LOAD",
                          "routePattern": "/clubs/:slug/app",
                          "durationMs": 120,
                          "navigationType": "LOAD",
                          "result": "success"
                        }
                      ]
                    }
                    """.trimIndent()
            }.andExpect {
                status { isAccepted() }
                jsonPath("$.accepted") { value(1) }
                jsonPath("$.dropped") { value(0) }
            }

        verify(useCase).record(anyList())
    }

    @Test
    fun `rejects unsafe raw route pattern`() {
        mockMvc
            .post("/api/observability/frontend-events") {
                contentType = MediaType.APPLICATION_JSON
                content =
                    """
                    {
                      "events": [
                        {
                          "type": "API_FAILURE",
                          "routePattern": "/clubs/reading-sai/app",
                          "apiGroup": "host-session",
                          "statusClass": "5xx",
                          "errorCode": "INTERNAL_ERROR"
                        }
                      ]
                    }
                    """.trimIndent()
            }.andExpect {
                status { isAccepted() }
                jsonPath("$.accepted") { value(0) }
                jsonPath("$.dropped") { value(1) }
            }
    }
}
```

- [ ] **Step 8: Run controller tests and verify they fail**

Run:

```bash
./server/gradlew -p server unitTest --tests com.readmates.observability.adapter.in.web.FrontendObservabilityControllerTest
```

Expected: FAIL because `FrontendObservabilityController` does not exist.

- [ ] **Step 9: Implement controller mapping and validation**

Create `server/src/main/kotlin/com/readmates/observability/adapter/in/web/FrontendObservabilityController.kt`:

```kotlin
package com.readmates.observability.adapter.`in`.web

import com.readmates.observability.application.model.FrontendApiFailureEvent
import com.readmates.observability.application.model.FrontendObservabilityEvent
import com.readmates.observability.application.model.FrontendObservabilityResult
import com.readmates.observability.application.model.FrontendRouteLoadEvent
import com.readmates.observability.application.model.FrontendRuntimeErrorEvent
import com.readmates.observability.application.port.`in`.RecordFrontendObservabilityUseCase
import org.springframework.http.HttpStatus
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.ResponseStatus
import org.springframework.web.bind.annotation.RestController
import java.time.Duration

@RestController
@RequestMapping("/api/observability/frontend-events")
class FrontendObservabilityController(
    private val recordFrontendObservability: RecordFrontendObservabilityUseCase,
) {
    @PostMapping
    @ResponseStatus(HttpStatus.ACCEPTED)
    fun record(
        @RequestBody request: FrontendObservabilityRequest,
    ): FrontendObservabilityResponse {
        val events = request.events.take(MAX_EVENTS)
        val mapped = events.mapNotNull(FrontendObservabilityEventRequest::toApplicationEvent)
        val dropped = events.size - mapped.size
        val result = recordFrontendObservability.record(mapped)
        return FrontendObservabilityResponse(
            accepted = result.accepted,
            dropped = result.dropped + dropped,
        )
    }

    private companion object {
        const val MAX_EVENTS = 20
    }
}

data class FrontendObservabilityRequest(
    val events: List<FrontendObservabilityEventRequest> = emptyList(),
)

data class FrontendObservabilityEventRequest(
    val type: String? = null,
    val routePattern: String? = null,
    val durationMs: Long? = null,
    val navigationType: String? = null,
    val result: String? = null,
    val errorKind: String? = null,
    val errorCode: String? = null,
    val severity: String? = null,
    val apiGroup: String? = null,
    val statusClass: String? = null,
) {
    fun toApplicationEvent(): FrontendObservabilityEvent? {
        val safeRoute = routePattern?.takeIf(::isSafeRoutePattern) ?: return null
        return when (type) {
            "ROUTE_LOAD" -> {
                val duration = durationMs?.takeIf { it in 0..60_000 } ?: return null
                val nav = navigationType?.takeIf { it in setOf("LOAD", "PUSH", "POP", "REPLACE") } ?: return null
                val outcome = result?.takeIf { it in setOf("success", "error") } ?: return null
                FrontendRouteLoadEvent(safeRoute, Duration.ofMillis(duration), nav, outcome)
            }
            "RUNTIME_ERROR" -> {
                val kind = errorKind?.takeIf { it in setOf("render", "unhandled-rejection", "unknown") } ?: return null
                val code = errorCode?.takeIf(::isSafeCode) ?: return null
                val level = severity?.takeIf { it in setOf("warn", "error") } ?: return null
                FrontendRuntimeErrorEvent(safeRoute, kind, code, level)
            }
            "API_FAILURE" -> {
                val group = apiGroup?.takeIf { it in allowedApiGroups } ?: return null
                val status = statusClass?.takeIf { it in setOf("4xx", "5xx", "network", "unknown") } ?: return null
                val code = errorCode?.takeIf(::isSafeCode) ?: return null
                FrontendApiFailureEvent(safeRoute, group, status, code)
            }
            else -> null
        }
    }
}

data class FrontendObservabilityResponse(
    val accepted: Int,
    val dropped: Int,
)

private val allowedApiGroups =
    setOf(
        "admin-ai",
        "admin-audit",
        "admin-club",
        "admin-health",
        "admin-notification",
        "admin-support",
        "auth",
        "feedback",
        "host-member",
        "host-notification",
        "host-session",
        "member",
        "notification",
        "public",
        "unknown",
    )

private fun isSafeCode(value: String): Boolean = Regex("^[A-Z][A-Z0-9_]{1,63}$").matches(value)

private fun isSafeRoutePattern(value: String): Boolean {
    if (value == "unknown") return true
    if (!value.startsWith("/") || value.contains("?") || value.contains("#")) return false
    if (Regex("[0-9a-f]{8}-[0-9a-f-]{27}", RegexOption.IGNORE_CASE).containsMatchIn(value)) return false
    if (Regex("/clubs/(?!:slug(?:/|$))[^/]+").containsMatchIn(value)) return false
    return true
}
```

- [ ] **Step 10: Register observability slice in architecture test**

Modify `server/src/test/kotlin/com/readmates/architecture/ServerArchitectureBoundaryTest.kt` by adding this entry to `serverSlices` after `admin.health`:

```kotlin
            ServerSlice(
                name = "observability",
                type = ServerSliceType.OPS_READ,
                webAdapterPackages = listOf("com.readmates.observability.adapter.in.web.."),
                applicationPackages = listOf("com.readmates.observability.application.."),
            ),
```

Update the registry assertion set from:

```kotlin
setOf("admin.audit", "admin.health", "admin.analytics", "aigen", "sessionclosing")
```

to:

```kotlin
setOf("admin.audit", "admin.health", "admin.analytics", "aigen", "sessionclosing", "observability")
```

- [ ] **Step 11: Run focused server tests**

Run:

```bash
./server/gradlew -p server unitTest --tests 'com.readmates.observability.*'
./server/gradlew -p server architectureTest
```

Expected: PASS.

- [ ] **Step 12: Commit Task 4**

```bash
git add server/src/main/kotlin/com/readmates/observability server/src/test/kotlin/com/readmates/observability server/src/test/kotlin/com/readmates/architecture/ServerArchitectureBoundaryTest.kt
git commit -m "feat(server): record frontend observability metrics"
```

---

### Task 5: App Route Load And Runtime Error Wiring

**Files:**
- Create: `front/src/app/route-observability.ts`
- Create: `front/src/app/route-observability.test.ts`
- Modify: `front/src/app/router.tsx`
- Modify: `front/shared/ui/route-error.tsx`
- Modify: `front/tests/unit/readmates-fetch.test.ts` if timing of singleton flush needs test cleanup.

**Interfaces:**
- Consumes:
  - `recordFrontendRouteLoad`
  - `recordFrontendRuntimeError`
- Produces:
  - `export function attachRouteObservability(router: Router): () => void`
  - `export function installGlobalRuntimeErrorObservers(): () => void`

- [ ] **Step 1: Write failing app route observability tests**

Create `front/src/app/route-observability.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { attachRouteObservability, installGlobalRuntimeErrorObservers } from "./route-observability";
import * as frontendTelemetry from "@/shared/observability/frontend-observability";

describe("route observability wiring", () => {
  it("records route load when router navigation returns to idle", () => {
    const recordSpy = vi.spyOn(frontendTelemetry, "recordFrontendRouteLoad").mockImplementation(() => undefined);
    let listener: ((state: { location: { pathname: string }; navigation: { state: string }; historyAction: string }) => void) | null = null;
    const router = {
      state: { location: { pathname: "/app" }, navigation: { state: "idle" }, historyAction: "POP" },
      subscribe(callback: typeof listener) {
        listener = callback;
        return () => undefined;
      },
    };

    const detach = attachRouteObservability(router as never);
    listener?.({ location: { pathname: "/app/session/current" }, navigation: { state: "loading" }, historyAction: "PUSH" });
    listener?.({ location: { pathname: "/app/session/current" }, navigation: { state: "idle" }, historyAction: "PUSH" });
    detach();

    expect(recordSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        pathname: "/app/session/current",
        navigationType: "PUSH",
        result: "success",
      }),
    );
  });

  it("records unhandled rejections without leaking raw stack", () => {
    const recordSpy = vi.spyOn(frontendTelemetry, "recordFrontendRuntimeError").mockImplementation(() => undefined);
    const remove = installGlobalRuntimeErrorObservers();

    window.dispatchEvent(new PromiseRejectionEvent("unhandledrejection", { reason: new Error("private token message") }));
    remove();

    expect(recordSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        errorKind: "unhandled-rejection",
        errorCode: "UNHANDLED_REJECTION",
        severity: "error",
        message: "private token message",
      }),
    );
  });
});
```

- [ ] **Step 2: Run route observability tests and verify they fail**

Run:

```bash
npx --yes pnpm@10.33.0 --dir front test -- route-observability
```

Expected: FAIL because `front/src/app/route-observability.ts` does not exist.

- [ ] **Step 3: Implement route and global error observers**

Create `front/src/app/route-observability.ts`:

```ts
import type { Router } from "@remix-run/router";
import { recordFrontendRouteLoad, recordFrontendRuntimeError } from "@/shared/observability/frontend-observability";
import type { FrontendNavigationType } from "@/shared/observability/frontend-observability-contracts";

function navigationTypeFromAction(action: string): FrontendNavigationType {
  if (action === "PUSH" || action === "POP" || action === "REPLACE") return action;
  return "LOAD";
}

export function attachRouteObservability(router: Router): () => void {
  let navigationStartedAt = performance.now();
  let lastPathname = router.state.location.pathname;

  const unsubscribe = router.subscribe((state) => {
    if (state.location.pathname !== lastPathname || state.navigation.state !== "idle") {
      if (state.navigation.state !== "idle") {
        navigationStartedAt = performance.now();
      }
      lastPathname = state.location.pathname;
    }

    if (state.navigation.state === "idle") {
      recordFrontendRouteLoad({
        pathname: state.location.pathname,
        durationMs: Math.max(0, performance.now() - navigationStartedAt),
        navigationType: navigationTypeFromAction(state.historyAction),
        result: "success",
      });
      navigationStartedAt = performance.now();
    }
  });

  return unsubscribe;
}

function messageFromReason(reason: unknown): string | undefined {
  if (reason instanceof Error) return reason.message;
  if (typeof reason === "string") return reason;
  return undefined;
}

export function installGlobalRuntimeErrorObservers(): () => void {
  const onError = (event: ErrorEvent) => {
    recordFrontendRuntimeError({
      errorKind: "unknown",
      errorCode: "WINDOW_ERROR",
      severity: "error",
      message: event.message,
    });
  };
  const onUnhandledRejection = (event: PromiseRejectionEvent) => {
    recordFrontendRuntimeError({
      errorKind: "unhandled-rejection",
      errorCode: "UNHANDLED_REJECTION",
      severity: "error",
      message: messageFromReason(event.reason),
    });
  };
  window.addEventListener("error", onError);
  window.addEventListener("unhandledrejection", onUnhandledRejection);
  return () => {
    window.removeEventListener("error", onError);
    window.removeEventListener("unhandledrejection", onUnhandledRejection);
  };
}
```

- [ ] **Step 4: Wire router creation**

Modify `front/src/app/router.tsx` by adding:

```ts
import { attachRouteObservability, installGlobalRuntimeErrorObservers } from "@/src/app/route-observability";
```

Replace `createReadmatesRouter()`:

```ts
export function createReadmatesRouter() {
  const queryClient = createReadmatesQueryClient();
  const router = createBrowserRouter(buildRoutes(queryClient));
  return { router, queryClient };
}
```

with:

```ts
let runtimeObserversInstalled = false;

export function createReadmatesRouter() {
  const queryClient = createReadmatesQueryClient();
  const router = createBrowserRouter(buildRoutes(queryClient));
  attachRouteObservability(router);
  if (!runtimeObserversInstalled && typeof window !== "undefined") {
    installGlobalRuntimeErrorObservers();
    runtimeObserversInstalled = true;
  }
  return { router, queryClient };
}
```

- [ ] **Step 5: Wire route error boundary**

Modify `front/shared/ui/route-error.tsx` by adding imports:

```tsx
import { useEffect } from "react";
import { recordFrontendRuntimeError } from "@/shared/observability/frontend-observability";
```

Replace `RouteErrorBoundary`:

```tsx
export function RouteErrorBoundary({ variant }: { variant: RouteErrorVariant }) {
  const error = useRouteError();

  return <RouteErrorPage variant={variant} status={statusFromRouteError(error)} />;
}
```

with:

```tsx
export function RouteErrorBoundary({ variant }: { variant: RouteErrorVariant }) {
  const error = useRouteError();
  const status = statusFromRouteError(error);

  useEffect(() => {
    recordFrontendRuntimeError({
      errorKind: "render",
      errorCode: status >= 500 ? "REACT_ROUTE_ERROR" : "ROUTE_ERROR_RESPONSE",
      severity: status >= 500 ? "error" : "warn",
      message: error instanceof Error ? error.message : undefined,
    });
  }, [error, status]);

  return <RouteErrorPage variant={variant} status={status} />;
}
```

- [ ] **Step 6: Run focused frontend tests**

Run:

```bash
npx --yes pnpm@10.33.0 --dir front test -- route-observability readmates-fetch
```

Expected: PASS.

- [ ] **Step 7: Run broader frontend unit/build checks for changed shared/app code**

Run:

```bash
npx --yes pnpm@10.33.0 --dir front test
npx --yes pnpm@10.33.0 --dir front build
```

Expected: PASS.

- [ ] **Step 8: Commit Task 5**

```bash
git add front/src/app/route-observability.ts front/src/app/route-observability.test.ts front/src/app/router.tsx front/shared/ui/route-error.tsx front/tests/unit/readmates-fetch.test.ts
git commit -m "feat(front): wire runtime route observability"
```

---

### Task 6: Observability Dashboard, Docs, And Release Readiness

**Files:**
- Create: `ops/grafana/dashboards/frontend-runtime.json`
- Modify: `docs/development/architecture.md`
- Modify: `docs/operations/observability/metrics-catalog.md`
- Modify: `docs/operations/observability/slos.md`
- Modify: `docs/operations/observability/dashboards.md`
- Modify: `docs/operations/runbooks/deploy-observability-check.md`
- Modify: `docs/development/release-readiness-review.md`
- Modify: `CHANGELOG.md`

**Interfaces:**
- Consumes: metric names from Task 4.
- Produces: public-safe docs and a Grafana dashboard JSON validated by existing scripts.

- [ ] **Step 1: Add frontend runtime dashboard JSON**

Create `ops/grafana/dashboards/frontend-runtime.json` with this structure:

```json
{
  "annotations": {
    "list": []
  },
  "editable": false,
  "fiscalYearStartMonth": 0,
  "graphTooltip": 0,
  "id": null,
  "links": [],
  "liveNow": false,
  "panels": [
    {
      "datasource": { "type": "prometheus", "uid": "ReadMates Prometheus" },
      "fieldConfig": { "defaults": { "unit": "s" }, "overrides": [] },
      "gridPos": { "h": 8, "w": 12, "x": 0, "y": 0 },
      "id": 1,
      "options": { "legend": { "displayMode": "table", "placement": "bottom" }, "tooltip": { "mode": "single", "sort": "none" } },
      "targets": [
        {
          "expr": "histogram_quantile(0.95, sum by (le, route_pattern) (rate(readmates_frontend_route_load_seconds_bucket[5m])))",
          "legendFormat": "{{route_pattern}}",
          "refId": "A"
        }
      ],
      "title": "Frontend route load p95",
      "type": "timeseries"
    },
    {
      "datasource": { "type": "prometheus", "uid": "ReadMates Prometheus" },
      "fieldConfig": { "defaults": { "unit": "short" }, "overrides": [] },
      "gridPos": { "h": 8, "w": 12, "x": 12, "y": 0 },
      "id": 2,
      "options": { "legend": { "displayMode": "table", "placement": "bottom" }, "tooltip": { "mode": "single", "sort": "none" } },
      "targets": [
        {
          "expr": "sum by (route_pattern, error_code) (increase(readmates_frontend_runtime_errors_total[15m]))",
          "legendFormat": "{{route_pattern}} {{error_code}}",
          "refId": "A"
        }
      ],
      "title": "Frontend runtime errors",
      "type": "timeseries"
    },
    {
      "datasource": { "type": "prometheus", "uid": "ReadMates Prometheus" },
      "fieldConfig": { "defaults": { "unit": "short" }, "overrides": [] },
      "gridPos": { "h": 8, "w": 12, "x": 0, "y": 8 },
      "id": 3,
      "options": { "legend": { "displayMode": "table", "placement": "bottom" }, "tooltip": { "mode": "single", "sort": "none" } },
      "targets": [
        {
          "expr": "sum by (api_group, status_class, error_code) (increase(readmates_frontend_api_failures_total[15m]))",
          "legendFormat": "{{api_group}} {{status_class}} {{error_code}}",
          "refId": "A"
        }
      ],
      "title": "Frontend API failures",
      "type": "timeseries"
    },
    {
      "datasource": { "type": "prometheus", "uid": "ReadMates Prometheus" },
      "fieldConfig": { "defaults": { "unit": "short" }, "overrides": [] },
      "gridPos": { "h": 8, "w": 12, "x": 12, "y": 8 },
      "id": 4,
      "options": { "legend": { "displayMode": "table", "placement": "bottom" }, "tooltip": { "mode": "single", "sort": "none" } },
      "targets": [
        {
          "expr": "sum by (reason) (increase(readmates_frontend_observability_dropped_total[15m]))",
          "legendFormat": "{{reason}}",
          "refId": "A"
        }
      ],
      "title": "Dropped frontend telemetry",
      "type": "timeseries"
    }
  ],
  "refresh": "30s",
  "schemaVersion": 39,
  "style": "dark",
  "tags": ["readmates", "frontend", "observability"],
  "templating": { "list": [] },
  "time": { "from": "now-6h", "to": "now" },
  "timepicker": {},
  "timezone": "",
  "title": "Frontend Runtime",
  "uid": "readmates-frontend-runtime",
  "version": 1,
  "weekStart": ""
}
```

- [ ] **Step 2: Update observability docs**

Update `docs/operations/observability/metrics-catalog.md` custom metrics table with these rows:

```markdown
| `readmates.frontend.route_load` | timer/histogram | `route_pattern`, `result`, `navigation_type` | 초 | Browser route transition duration. Route values are normalized patterns only. | `server/.../FrontendObservabilityMetrics.kt` | dashboards.md#frontend-runtime | slos.md#frontend_route_load_p95 |
| `readmates.frontend.runtime_errors` | counter | `route_pattern`, `error_kind`, `error_code`, `severity` | 건수 | Browser runtime and route-boundary errors grouped without raw messages or stack traces. | `server/.../FrontendObservabilityMetrics.kt` | dashboards.md#frontend-runtime | slos.md#frontend_runtime_error_ratio |
| `readmates.frontend.api_failures` | counter | `route_pattern`, `api_group`, `status_class`, `error_code` | 건수 | Frontend-observed API failures after safe API error conversion. | `server/.../FrontendObservabilityMetrics.kt` | dashboards.md#frontend-runtime | — |
| `readmates.frontend.observability.dropped` | counter | `reason` | 건수 | Dropped frontend telemetry events due to validation, size, unsupported value, or rate-limit policy. | `server/.../FrontendObservabilityMetrics.kt` | dashboards.md#frontend-runtime | — |
```

Replace the current follow-up bullet for `frontend_route_load_seconds` with:

```markdown
- External blackbox/synthetic checks for full script-load failure remain a future candidate. The in-app route-load metric starts only after the SPA executes enough JavaScript to emit telemetry.
```

Update `docs/operations/observability/slos.md` by adding:

```markdown
## `frontend_route_load_p95`

- **정의**: 7일 rolling window에서 browser route load p95 < 1500ms.
- **측정**:
  ```promql
  histogram_quantile(0.95,
    sum by (le) (rate(readmates_frontend_route_load_seconds_bucket[5m]))) * 1000
  ```
- **에러 예산**: 측정 시작 단계. 첫 production baseline이 쌓일 때까지 release hard gate로 쓰지 않는다.
- **위반 시 행동**: frontend bundle/chunk 변화, route lazy loading, CDN/cache, API failure panel, browser console reproduction 순서로 확인한다.
- **근거**: 서버 read p95보다 느슨한 browser route-level threshold로 초기 baseline을 잡는다.
- **현재**: 측정 중.

## `frontend_runtime_error_ratio`

- **정의**: 7일 rolling window에서 route load 대비 runtime error 비율 < 1%.
- **측정**:
  ```promql
  sum(rate(readmates_frontend_runtime_errors_total[5m]))
    /
  sum(rate(readmates_frontend_route_load_seconds_count[5m]))
  ```
- **에러 예산**: 측정 시작 단계. 반복 error code와 route pattern이 보이면 우선 triage한다.
- **위반 시 행동**: 최근 frontend deploy, route error boundary, API failure panel, user-visible route fallback을 확인한다.
- **근거**: 서버 5xx가 없어도 사용자가 흰 화면이나 route fallback을 겪는 blind spot을 닫기 위한 baseline.
- **현재**: 측정 중.
```

Update `docs/operations/observability/dashboards.md` with a section:

```markdown
## Dashboard 4 — Frontend Runtime
<a id="frontend-runtime"></a>

실제 dashboard JSON은 `ops/grafana/dashboards/frontend-runtime.json`(title: "Frontend Runtime")입니다.

### Panel: Frontend route load p95
- 목적: Browser SPA route transition latency를 route pattern별로 확인한다.
- 메트릭: `readmates_frontend_route_load_seconds_bucket`
- PromQL:
  ```promql
  histogram_quantile(0.95, sum by (le, route_pattern) (rate(readmates_frontend_route_load_seconds_bucket[5m])))
  ```

### Panel: Frontend runtime errors
- 목적: React route error, window error, unhandled rejection을 raw message 없이 route/error code로 묶어 본다.
- 메트릭: `readmates_frontend_runtime_errors_total`
- PromQL:
  ```promql
  sum by (route_pattern, error_code) (increase(readmates_frontend_runtime_errors_total[15m]))
  ```

### Panel: Frontend API failures
- 목적: Browser가 본 API 실패를 API group/status class/error code로 확인한다.
- 메트릭: `readmates_frontend_api_failures_total`
- PromQL:
  ```promql
  sum by (api_group, status_class, error_code) (increase(readmates_frontend_api_failures_total[15m]))
  ```

### Panel: Dropped frontend telemetry
- 목적: 수집기가 유효하지 않은 값을 버리는지, 또는 route pattern allowlist가 누락됐는지 확인한다.
- 메트릭: `readmates_frontend_observability_dropped_total`
- PromQL:
  ```promql
  sum by (reason) (increase(readmates_frontend_observability_dropped_total[15m]))
  ```
```

- [ ] **Step 3: Update architecture, runbook, release-readiness, and changelog**

Add a short frontend observability paragraph to `docs/development/architecture.md` near the observability or request-flow area:

```markdown
Frontend runtime observability is a same-origin telemetry side path. The SPA sends only normalized route patterns, enum-like API groups, status classes, safe error codes, and optional short message hash prefixes to `/api/bff/observability/frontend-events`. The BFF forwards the batch to Spring with the BFF secret, and Spring records Micrometer metrics under `readmates.frontend.*`. Raw URLs, query strings, club slugs, UUIDs, emails, user/member identifiers, stack traces, request/response bodies, cookies, OAuth codes, and deployment identifiers are not sent or used as metric labels. Telemetry failure is fail-open and cannot block product flows.
```

Add this to `docs/operations/runbooks/deploy-observability-check.md` under "What This Runbook Proves":

```markdown
- Frontend runtime dashboard JSON can be loaded by Grafana provisioning checks.
- Frontend route-load/error metrics are documented as measurement-start signals; absence of data before production traffic is not proof of no frontend runtime errors.
```

Add a release-readiness note to the top of `docs/development/release-readiness-review.md`:

```markdown
## 2026-06-30 frontend observability v2 closeout

- Scope reviewed: frontend runtime telemetry contracts, BFF telemetry intake, Spring `readmates.frontend.*` Micrometer metrics, Grafana dashboard JSON, and observability docs.
- Release classification: operational observability side path. No DB migration, product API response contract, OAuth scope, auth cookie contract, user-facing route behavior, or deploy workflow behavior changes are included.
- Public safety: browser telemetry sends normalized route patterns, enum-like API groups, status classes, safe error codes, and optional short hash prefixes only. Raw URL, query string, club slug value, UUID, email, display name, account name, membership/user id, stack trace, request/response body, token, private domain, OCID, VM IP, and deployment state are prohibited.
- Local verification before merge:
  - `npx --yes pnpm@10.33.0 --dir front test -- observability route-observability readmates-fetch frontend-observability-bff` - pass.
  - `npx --yes pnpm@10.33.0 --dir front test` - pass.
  - `npx --yes pnpm@10.33.0 --dir front build` - pass.
  - `./server/gradlew -p server unitTest --tests 'com.readmates.observability.*'` - pass.
  - `./server/gradlew -p server architectureTest` - pass.
  - `./scripts/lint-grafana-dashboards.sh` - pass.
  - `./scripts/validate-prometheus-rules.sh` - pass.
  - `./scripts/build-public-release-candidate.sh` and `./scripts/public-release-check.sh .tmp/public-release-candidate` - pass.
- Skipped before merge: production scrape, dashboard data confirmation, external blackbox checks, production OAuth/provider-console/tag workflows. These require production traffic or operator access and are not local evidence for this side-path branch.
- Residual risk: total frontend script-load failure can still be invisible until external synthetic monitoring is added. Frontend SLOs start in measurement mode and should not page until baseline data exists.
```

Add a `CHANGELOG.md` Unreleased bullet:

```markdown
- **frontend observability v2:** Browser route-load, runtime-error, and API-failure signals now flow through a same-origin BFF telemetry endpoint into Spring Micrometer metrics and Grafana docs, using normalized route patterns and low-cardinality labels only.
```

- [ ] **Step 4: Run docs/dashboard validation**

Run:

```bash
git diff --check -- docs/development/architecture.md docs/operations/observability/metrics-catalog.md docs/operations/observability/slos.md docs/operations/observability/dashboards.md docs/operations/runbooks/deploy-observability-check.md docs/development/release-readiness-review.md CHANGELOG.md ops/grafana/dashboards/frontend-runtime.json
./scripts/lint-grafana-dashboards.sh
./scripts/validate-prometheus-rules.sh
```

Expected: PASS.

- [ ] **Step 5: Run release/public-safety validation**

Run:

```bash
npx --yes pnpm@10.33.0 --dir front test
npx --yes pnpm@10.33.0 --dir front build
./server/gradlew -p server clean test
./server/gradlew -p server architectureTest
./scripts/build-public-release-candidate.sh
./scripts/public-release-check.sh .tmp/public-release-candidate
```

Expected: PASS.

- [ ] **Step 6: Commit Task 6**

```bash
git add ops/grafana/dashboards/frontend-runtime.json docs/development/architecture.md docs/operations/observability/metrics-catalog.md docs/operations/observability/slos.md docs/operations/observability/dashboards.md docs/operations/runbooks/deploy-observability-check.md docs/development/release-readiness-review.md CHANGELOG.md
git commit -m "docs: document frontend runtime observability"
```

---

## Final Verification

Run after all tasks:

```bash
git diff --check -- front server ops docs CHANGELOG.md
npx --yes pnpm@10.33.0 --dir front test
npx --yes pnpm@10.33.0 --dir front build
./server/gradlew -p server clean test
./server/gradlew -p server architectureTest
./scripts/lint-grafana-dashboards.sh
./scripts/validate-prometheus-rules.sh
./scripts/build-public-release-candidate.sh
./scripts/public-release-check.sh .tmp/public-release-candidate
```

Expected: all commands pass.

Do not claim production frontend observability is active until a deployed environment has generated `readmates_frontend_route_load_seconds_count` samples and Grafana has shown the `Frontend Runtime` dashboard with production data. Local verification proves code, privacy constraints, dashboards, and public-release safety only.
