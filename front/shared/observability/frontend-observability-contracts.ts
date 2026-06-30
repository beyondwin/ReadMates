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

export type FrontendObservabilityDropReason = "invalid_route_pattern" | "invalid_event" | "batch_limit";

export type SanitizedFrontendObservabilityBatch = FrontendObservabilityBatch & {
  droppedReasons: FrontendObservabilityDropReason[];
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

function dropReason(event: unknown): FrontendObservabilityDropReason {
  const record = asRecord(event);
  if (record?.routePattern !== undefined && safeRoutePattern(record.routePattern) === null) {
    return "invalid_route_pattern";
  }
  return "invalid_event";
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
  return { events: sanitizeFrontendObservabilityBatchWithDropped(events).events };
}

export function sanitizeFrontendObservabilityBatchWithDropped(events: unknown[]): SanitizedFrontendObservabilityBatch {
  const sanitized: FrontendObservabilityEvent[] = [];
  const droppedReasons: FrontendObservabilityDropReason[] = [];
  for (const event of events) {
    const safe = sanitizeFrontendObservabilityEvent(event);
    if (!safe) {
      droppedReasons.push(dropReason(event));
    } else if (sanitized.length < FRONTEND_OBSERVABILITY_MAX_EVENTS) {
      sanitized.push(safe);
    } else {
      droppedReasons.push("batch_limit");
    }
  }
  return { events: sanitized, droppedReasons };
}
