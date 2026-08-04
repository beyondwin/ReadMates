import { afterEach, describe, expect, it, vi } from "vitest";
import { isReadmatesApiError } from "@/shared/api/errors";
import {
  acknowledgeAdminOperationCase,
  fetchAdminOperationCase,
  fetchAdminOperationCases,
  resolveAdminOperationCase,
  snoozeAdminOperationCase,
} from "./platform-admin-operations-api";

const caseCore = {
  id: "00000000-0000-4000-8000-000000000001",
  sourceType: "NOTIFICATION",
  clubId: "00000000-0000-4000-8000-000000000002",
  state: "OPEN",
  severity: "CRITICAL",
  summaryCode: "NOTIFICATION_DELIVERY_FAILURE",
  firstObservedAt: "2026-08-04T00:00:00Z",
  lastObservedAt: "2026-08-04T00:05:00Z",
  snoozedUntil: null,
  resolvedAt: null,
  assignedToMe: false,
  reopenCount: 0,
  version: 3,
  impactCount: 4,
  detailHref: "/admin/notifications",
} as const;

const source = {
  sourceType: "NOTIFICATION",
  status: "AVAILABLE",
  generatedAt: "2026-08-04T00:05:00Z",
  lastSuccessfulAt: "2026-08-04T00:05:00Z",
  authoritative: true,
} as const;

function jsonResponse(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { "Content-Type": "application/json", ...init.headers },
  });
}

function successfulFetch(body: unknown) {
  return vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse(body));
}

describe("platform admin operations API", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("encodes only allowlisted list filters into the operations endpoint", async () => {
    const fetchSpy = successfulFetch({
      schema: "admin.operation_cases.v1",
      generatedAt: "2026-08-04T00:05:00Z",
      counts: { open: 1, critical: 1, assignedToMe: 0, snoozed: 0 },
      sources: [source],
      items: [{ ...caseCore, allowedActions: ["ACKNOWLEDGE", "SNOOZE", "RESOLVE"], source }],
      nextCursor: "opaque+/=cursor",
    });

    await fetchAdminOperationCases({
      states: ["OPEN", "ACKNOWLEDGED"],
      severities: ["CRITICAL", "WARNING"],
      sources: ["NOTIFICATION", "AI_JOB"],
      assignee: "ME",
      limit: 25,
      cursor: "opaque+/=cursor",
      legacySummary: true,
    } as never);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy.mock.calls[0]?.[0]).toBe(
      "/api/bff/api/admin/operations/cases?state=OPEN%2CACKNOWLEDGED&severity=CRITICAL%2CWARNING&source=NOTIFICATION%2CAI_JOB&assignee=ME&limit=25&cursor=opaque%2B%2F%3Dcursor",
    );
    expect(fetchSpy.mock.calls[0]?.[1]).toMatchObject({ cache: "no-store" });
  });

  it("fetches detail from the encoded case endpoint without legacy requests", async () => {
    const fetchSpy = successfulFetch({
      schema: "admin.operation_cases.v1",
      item: { ...caseCore, allowedActions: ["ACKNOWLEDGE"], source },
      history: [],
    });

    await fetchAdminOperationCase("case/with space");

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy.mock.calls[0]?.[0]).toBe(
      "/api/bff/api/admin/operations/cases/case%2Fwith%20space",
    );
  });

  it.each([
    ["acknowledge", acknowledgeAdminOperationCase, { expectedVersion: 3 }],
    ["resolve", resolveAdminOperationCase, { expectedVersion: 3 }],
  ] as const)("posts the exact expectedVersion body for %s", async (action, request, body) => {
    const fetchSpy = successfulFetch({ schema: "admin.operation_cases.v1", ...caseCore });

    await request(caseCore.id, 3);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy.mock.calls[0]?.[0]).toBe(
      `/api/bff/api/admin/operations/cases/${caseCore.id}/${action}`,
    );
    expect(fetchSpy.mock.calls[0]?.[1]).toMatchObject({
      method: "POST",
      body: JSON.stringify(body),
      cache: "no-store",
    });
  });

  it("posts the snooze timestamp as an ISO string beside expectedVersion", async () => {
    const fetchSpy = successfulFetch({ schema: "admin.operation_cases.v1", ...caseCore });

    await snoozeAdminOperationCase(caseCore.id, 3, "2026-08-05T09:30:00+09:00");

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy.mock.calls[0]?.[0]).toBe(
      `/api/bff/api/admin/operations/cases/${caseCore.id}/snooze`,
    );
    expect(fetchSpy.mock.calls[0]?.[1]).toMatchObject({
      method: "POST",
      body: JSON.stringify({ expectedVersion: 3, snoozedUntil: "2026-08-05T09:30:00+09:00" }),
      cache: "no-store",
    });
  });

  it("propagates the server error code and status as a typed API error", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse(
        {
          code: "CASE_VERSION_CONFLICT",
          message: "다른 운영자가 먼저 상태를 변경했습니다.",
          status: 409,
        },
        { status: 409 },
      ),
    );

    const error = await acknowledgeAdminOperationCase(caseCore.id, 2).catch((reason: unknown) => reason);

    expect(isReadmatesApiError(error)).toBe(true);
    if (isReadmatesApiError(error)) {
      expect({ code: error.code, status: error.status, message: error.message }).toEqual({
        code: "CASE_VERSION_CONFLICT",
        status: 409,
        message: "다른 운영자가 먼저 상태를 변경했습니다.",
      });
    }
  });
});
