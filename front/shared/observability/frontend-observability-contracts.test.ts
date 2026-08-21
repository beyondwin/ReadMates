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

  it("keeps only allowlisted host schedule default outcomes", () => {
    expect(
      sanitizeFrontendObservabilityEvent({
        type: "HOST_SCHEDULE_DEFAULTS",
        routePattern: "/app/host/sessions/new",
        outcome: "legacy_404",
      }),
    ).toEqual({
      type: "HOST_SCHEDULE_DEFAULTS",
      routePattern: "/app/host/sessions/new",
      outcome: "legacy_404",
    });
    expect(
      sanitizeFrontendObservabilityEvent({
        type: "HOST_SCHEDULE_DEFAULTS",
        routePattern: "/app/host/sessions/new",
        outcome: "timeout",
      }),
    ).toBeNull();
  });

  it("clamps host card duration and attention size and rejects extra identifiers", () => {
    expect(
      sanitizeFrontendObservabilityEvent({
        type: "HOST_OPERATIONS_CARD_LOAD",
        routePattern: "/app/host/operations",
        card: "attention",
        outcome: "success",
        durationMs: 90_000.4,
      }),
    ).toEqual({
      type: "HOST_OPERATIONS_CARD_LOAD",
      routePattern: "/app/host/operations",
      card: "attention",
      outcome: "success",
      durationMs: 60_000,
    });
    expect(
      sanitizeFrontendObservabilityEvent({
        type: "HOST_ATTENTION_RESULT",
        routePattern: "/app/host/operations",
        size: -12.7,
      }),
    ).toEqual({
      type: "HOST_ATTENTION_RESULT",
      routePattern: "/app/host/operations",
      size: 0,
    });
    expect(
      sanitizeFrontendObservabilityEvent({
        type: "HOST_ATTENTION_RESULT",
        routePattern: "/app/host/operations",
        size: 50_000,
      }),
    ).toEqual({
      type: "HOST_ATTENTION_RESULT",
      routePattern: "/app/host/operations",
      size: 10_000,
    });
    expect(
      sanitizeFrontendObservabilityEvent({
        type: "HOST_SCHEDULE_DEFAULTS",
        routePattern: "/app/host/sessions/new",
        outcome: "success",
        hasPasscode: false,
        meetingUrl: "https://meeting.invalid/club",
        clubId: "club-1",
        sessionId: "session-1",
      }),
    ).toBeNull();
    expect(
      sanitizeFrontendObservabilityEvent({
        type: "HOST_OPERATIONS_CARD_LOAD",
        routePattern: "/app/host/operations",
        card: "dashboard",
        outcome: "success",
        durationMs: 12,
      }),
    ).toBeNull();
    expect(
      sanitizeFrontendObservabilityEvent({
        type: "HOST_OPERATIONS_CARD_LOAD",
        routePattern: "/app/host/operations",
        card: "notifications",
        outcome: "error",
        durationMs: 40,
        membershipId: "membership-1",
        requestId: "req-1",
        reasonNote: "private",
      }),
    ).toBeNull();
  });
});
