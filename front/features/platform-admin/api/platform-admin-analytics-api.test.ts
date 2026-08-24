import { beforeEach, describe, expect, it, vi } from "vitest";
import { readmatesFetchResponse } from "@/shared/api/client";
import { fetchAdminAnalyticsExport } from "./platform-admin-analytics-api";

vi.mock("@/shared/api/client", () => ({
  readmatesFetch: vi.fn(),
  readmatesFetchResponse: vi.fn(),
}));

describe("platform-admin-analytics-api", () => {
  beforeEach(() => vi.clearAllMocks());

  it("downloads a no-store server CSV response and reads its attachment filename", async () => {
    vi.mocked(readmatesFetchResponse).mockResolvedValue(new Response("record_type\r\nmetadata\r\n", {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="readmates-admin-analytics-30d-2026-05-30.csv"',
      },
    }));

    const result = await fetchAdminAnalyticsExport("30d");

    expect(readmatesFetchResponse).toHaveBeenCalledWith(
      "/api/admin/analytics/export.csv?window=30d",
      undefined,
      { clubSlug: undefined },
    );
    expect(result.filename).toBe("readmates-admin-analytics-30d-2026-05-30.csv");
    expect(await result.blob.text()).toContain("metadata");
  });

  it("rejects a failed export response", async () => {
    vi.mocked(readmatesFetchResponse).mockResolvedValue(new Response("denied", { status: 403 }));
    await expect(fetchAdminAnalyticsExport("7d")).rejects.toThrow("Analytics export failed");
  });
});
