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
});
