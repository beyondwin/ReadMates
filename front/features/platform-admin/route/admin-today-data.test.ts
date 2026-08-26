import { QueryClient } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { adminTodayLoaderFactory } from "./admin-today-data";

const operationsApi = vi.hoisted(() => ({ fetchCases: vi.fn() }));

vi.mock("@/features/platform-admin/api/platform-admin-operations-api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/platform-admin/api/platform-admin-operations-api")>()),
  fetchAdminOperationCases: operationsApi.fetchCases,
}));

beforeEach(() => {
  vi.clearAllMocks();
  operationsApi.fetchCases.mockResolvedValue({
    schema: "admin.operation_cases.v1",
    generatedAt: "2026-08-04T10:00:00Z",
    counts: { open: 0, critical: 0, assignedToMe: 0, snoozed: 0 },
    sources: [],
    items: [],
    nextCursor: null,
  });
});

describe("adminTodayLoaderFactory", () => {
  it("prefetches only the operation case list for the parsed URL filter", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    await adminTodayLoaderFactory(client)({
      request: new Request("https://readmates.example/admin/today?state=open&source=notification&unknown=raw"),
    } as never);

    expect(operationsApi.fetchCases).toHaveBeenCalledOnce();
    expect(operationsApi.fetchCases).toHaveBeenCalledWith({
      states: ["OPEN"],
      sources: ["NOTIFICATION"],
    });
  });

  it("prefetches the briefing work view without forwarding search text or unknown params", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    await adminTodayLoaderFactory(client)({
      request: new Request("https://readmates.example/admin/today?q=%EC%95%8C%EB%A6%BC&unknown=raw"),
    } as never);

    expect(operationsApi.fetchCases).toHaveBeenCalledOnce();
    expect(operationsApi.fetchCases).toHaveBeenCalledWith({
      states: ["OPEN", "ACKNOWLEDGED"],
    });
  });

  it("prefetches the mine work view through the effective API filter", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    await adminTodayLoaderFactory(client)({
      request: new Request("https://readmates.example/admin/today?view=mine&q=%EC%95%8C%EB%A6%BC"),
    } as never);

    expect(operationsApi.fetchCases).toHaveBeenCalledOnce();
    expect(operationsApi.fetchCases).toHaveBeenCalledWith({
      states: ["OPEN", "ACKNOWLEDGED", "SNOOZED"],
      assignee: "ME",
    });
  });

  it("combines infinite-query pages so a first-page poll cannot drop continuation ids", async () => {
    const { combineAdminOperationCasePages } = await import("./admin-today-data");
    const first = {
      schema: "admin.operation_cases.v1" as const,
      generatedAt: "2026-08-04T10:15:00Z",
      counts: { open: 3, critical: 1, assignedToMe: 1, snoozed: 0 },
      sources: [],
      items: [{ id: "case-first", version: 9 }],
      nextCursor: "cursor-page-2",
    };
    const continuation = {
      ...first,
      generatedAt: "2026-08-04T10:00:00Z",
      items: [{ id: "case-continued", version: 1 }],
      nextCursor: null,
    };

    const combined = combineAdminOperationCasePages([first as never, continuation as never]);

    expect(combined?.items.map((item) => item.id)).toEqual(["case-first", "case-continued"]);
    expect(combined?.generatedAt).toBe("2026-08-04T10:15:00Z");
    expect(combined?.counts).toEqual({ open: 3, critical: 1, assignedToMe: 1, snoozed: 0 });
    expect(combined?.nextCursor).toBeNull();
  });
});
