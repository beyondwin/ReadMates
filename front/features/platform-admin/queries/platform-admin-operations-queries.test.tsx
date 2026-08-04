import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import type { PropsWithChildren } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  AdminOperationCaseDetailResponse,
  AdminOperationCaseFilter,
  AdminOperationCaseMutationResponse,
  AdminOperationCasesResponse,
} from "@/features/platform-admin/api/platform-admin-operations-contracts";

vi.mock("@/features/platform-admin/api/platform-admin-operations-api", () => ({
  acknowledgeAdminOperationCase: vi.fn(),
  fetchAdminOperationCase: vi.fn(),
  fetchAdminOperationCases: vi.fn(),
  resolveAdminOperationCase: vi.fn(),
  snoozeAdminOperationCase: vi.fn(),
}));

import {
  acknowledgeAdminOperationCase,
  fetchAdminOperationCase,
  fetchAdminOperationCases,
  resolveAdminOperationCase,
  snoozeAdminOperationCase,
} from "@/features/platform-admin/api/platform-admin-operations-api";
import {
  adminOperationsKeys,
  platformAdminOperationCaseQuery,
  platformAdminOperationCasesQuery,
  useAcknowledgeAdminOperationCaseMutation,
  useResolveAdminOperationCaseMutation,
  useSnoozeAdminOperationCaseMutation,
} from "./platform-admin-operations-queries";

const caseId = "00000000-0000-4000-8000-000000000001";
const source = {
  sourceType: "NOTIFICATION",
  status: "AVAILABLE",
  generatedAt: "2026-08-04T00:05:00Z",
  lastSuccessfulAt: "2026-08-04T00:05:00Z",
  authoritative: true,
} as const;
const caseCore = {
  id: caseId,
  sourceType: "NOTIFICATION",
  clubId: null,
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
const listResponse: AdminOperationCasesResponse = {
  schema: "admin.operation_cases.v1",
  generatedAt: "2026-08-04T00:05:00Z",
  counts: { open: 1, critical: 1, assignedToMe: 0, snoozed: 0 },
  sources: [source],
  items: [{ ...caseCore, allowedActions: ["ACKNOWLEDGE"], source }],
  nextCursor: null,
};
const detailResponse: AdminOperationCaseDetailResponse = {
  schema: "admin.operation_cases.v1",
  item: listResponse.items[0]!,
  history: [],
};
const mutationResponse: AdminOperationCaseMutationResponse = {
  schema: "admin.operation_cases.v1",
  ...caseCore,
  state: "ACKNOWLEDGED",
  assignedToMe: true,
  version: 4,
};

function createWrapper() {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Number.POSITIVE_INFINITY, staleTime: 0 },
      mutations: { retry: false },
    },
  });
  function Wrapper({ children }: PropsWithChildren) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  }
  return { client, Wrapper };
}

function seedReadCaches(client: QueryClient, filter: AdminOperationCaseFilter) {
  const listKey = adminOperationsKeys.list(filter);
  const detailKey = adminOperationsKeys.detail(caseId);
  client.setQueryData(listKey, listResponse);
  client.setQueryData(detailKey, detailResponse);
  return { detailKey, listKey };
}

describe("platform admin operations queries", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("normalizes set-like filters into stable list keys", () => {
    const first = adminOperationsKeys.list({
      states: ["OPEN", "ACKNOWLEDGED", "OPEN"],
      severities: ["WARNING", "CRITICAL"],
      sources: ["NOTIFICATION", "AI_JOB"],
      assignee: "ME",
      limit: 25,
      cursor: "opaque-cursor",
    });
    const second = adminOperationsKeys.list({
      cursor: "opaque-cursor",
      limit: 25,
      assignee: "ME",
      sources: ["AI_JOB", "NOTIFICATION"],
      severities: ["CRITICAL", "WARNING"],
      states: ["ACKNOWLEDGED", "OPEN"],
    });

    expect(first).toEqual(second);
    expect(first).toEqual([
      "platform-admin",
      "operations",
      "cases",
      "list",
      {
        states: ["ACKNOWLEDGED", "OPEN"],
        severities: ["CRITICAL", "WARNING"],
        sources: ["AI_JOB", "NOTIFICATION"],
        assignee: "ME",
        limit: 25,
        cursor: "opaque-cursor",
      },
    ]);
  });

  it("binds list and detail query functions to their normalized keys", async () => {
    vi.mocked(fetchAdminOperationCases).mockResolvedValue(listResponse);
    vi.mocked(fetchAdminOperationCase).mockResolvedValue(detailResponse);
    const filter = { states: ["OPEN"] } as const;
    const listOptions = platformAdminOperationCasesQuery(filter);
    const detailOptions = platformAdminOperationCaseQuery(caseId);
    const { client } = createWrapper();

    await Promise.all([client.fetchQuery(listOptions), client.fetchQuery(detailOptions)]);

    expect(listOptions.queryKey).toEqual(adminOperationsKeys.list(filter));
    expect(detailOptions.queryKey).toEqual(adminOperationsKeys.detail(caseId));
    expect(fetchAdminOperationCases).toHaveBeenCalledWith(filter);
    expect(fetchAdminOperationCase).toHaveBeenCalledWith(caseId);
  });

  it("polls only while the consumer is active and the document is visible", () => {
    const visibility = vi.spyOn(document, "visibilityState", "get");
    const activeOptions = platformAdminOperationCasesQuery({}, { active: true });
    const inactiveOptions = platformAdminOperationCasesQuery({}, { active: false });
    const unspecifiedOptions = platformAdminOperationCasesQuery({});
    if (typeof activeOptions.refetchInterval !== "function") {
      throw new Error("Expected functional refetchInterval");
    }
    if (typeof inactiveOptions.refetchInterval !== "function") {
      throw new Error("Expected functional refetchInterval");
    }
    if (typeof unspecifiedOptions.refetchInterval !== "function") {
      throw new Error("Expected functional refetchInterval");
    }

    visibility.mockReturnValue("visible");
    expect(activeOptions.refetchInterval({} as never)).toBe(15_000);
    expect(inactiveOptions.refetchInterval({} as never)).toBe(false);
    expect(unspecifiedOptions.refetchInterval({} as never)).toBe(false);

    visibility.mockReturnValue("hidden");
    expect(activeOptions.refetchInterval({} as never)).toBe(false);
  });

  it.each([
    ["acknowledge", useAcknowledgeAdminOperationCaseMutation, acknowledgeAdminOperationCase, { caseId, expectedVersion: 3 }],
    [
      "snooze",
      useSnoozeAdminOperationCaseMutation,
      snoozeAdminOperationCase,
      { caseId, expectedVersion: 3, snoozedUntil: "2026-08-05T00:00:00Z" },
    ],
    ["resolve", useResolveAdminOperationCaseMutation, resolveAdminOperationCase, { caseId, expectedVersion: 3 }],
  ] as const)("invalidates list and exact detail reads after %s succeeds", async (_name, useHook, api, variables) => {
    vi.mocked(api).mockResolvedValue(mutationResponse);
    const filter = { states: ["OPEN"] } as const;
    const { client, Wrapper } = createWrapper();
    const { detailKey, listKey } = seedReadCaches(client, filter);
    const otherDetailKey = adminOperationsKeys.detail("other-case");
    client.setQueryData(otherDetailKey, detailResponse);
    const { result } = renderHook(() => useHook(), { wrapper: Wrapper });

    await act(async () => {
      await result.current.mutateAsync(variables as never);
    });

    expect(client.getQueryState(listKey)?.isInvalidated).toBe(true);
    expect(client.getQueryState(detailKey)?.isInvalidated).toBe(true);
    expect(client.getQueryState(otherDetailKey)?.isInvalidated).toBe(false);
    expect(client.getQueryData(listKey)).toEqual(listResponse);
    expect(client.getQueryData(detailKey)).toEqual(detailResponse);
  });

  it("leaves list and detail cache data and freshness intact on version conflict", async () => {
    vi.mocked(acknowledgeAdminOperationCase).mockRejectedValue(
      Object.assign(new Error("다른 운영자가 먼저 상태를 변경했습니다."), {
        code: "CASE_VERSION_CONFLICT",
        status: 409,
      }),
    );
    const filter = { states: ["OPEN"] } as const;
    const { client, Wrapper } = createWrapper();
    const { detailKey, listKey } = seedReadCaches(client, filter);
    const { result } = renderHook(() => useAcknowledgeAdminOperationCaseMutation(), {
      wrapper: Wrapper,
    });

    await act(async () => {
      await result.current.mutateAsync({ caseId, expectedVersion: 2 }).catch(() => undefined);
    });

    expect(client.getQueryState(listKey)?.isInvalidated).toBe(false);
    expect(client.getQueryState(detailKey)?.isInvalidated).toBe(false);
    expect(client.getQueryData(listKey)).toEqual(listResponse);
    expect(client.getQueryData(detailKey)).toEqual(detailResponse);
  });
});
