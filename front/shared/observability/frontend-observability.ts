import {
  type FrontendNavigationType,
  type FrontendRouteLoadResult,
  type FrontendRuntimeErrorKind,
  type FrontendSeverity,
  type FrontendStatusClass,
  type HostOperationsCard,
  type HostOperationsOutcome,
  type HostScheduleDefaultsOutcome,
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
  if (!value || !globalThis.crypto?.subtle) return undefined;
  const bytes = new TextEncoder().encode(value);
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
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

export function recordHostScheduleDefaults(input: {
  pathname?: string;
  outcome: HostScheduleDefaultsOutcome;
}) {
  frontendObservability.record({
    type: "HOST_SCHEDULE_DEFAULTS",
    routePattern: normalizeFrontendRoutePattern(currentPathname(input.pathname)),
    outcome: input.outcome,
  });
  void frontendObservability.flush();
}

export function recordHostOperationsCardLoad(input: {
  pathname?: string;
  card: HostOperationsCard;
  outcome: HostOperationsOutcome;
  durationMs: number;
}) {
  frontendObservability.record({
    type: "HOST_OPERATIONS_CARD_LOAD",
    routePattern: normalizeFrontendRoutePattern(currentPathname(input.pathname)),
    card: input.card,
    outcome: input.outcome,
    durationMs: input.durationMs,
  });
  void frontendObservability.flush();
}

export function recordHostAttentionResult(input: {
  pathname?: string;
  size: number;
}) {
  frontendObservability.record({
    type: "HOST_ATTENTION_RESULT",
    routePattern: normalizeFrontendRoutePattern(currentPathname(input.pathname)),
    size: input.size,
  });
  void frontendObservability.flush();
}
