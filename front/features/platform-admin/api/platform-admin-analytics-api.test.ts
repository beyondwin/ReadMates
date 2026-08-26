import { beforeEach, describe, expect, it, vi } from "vitest";
import { readmatesFetchResponse } from "@/shared/api/client";
import { isReadmatesApiError } from "@/shared/api/errors";
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

  it("preserves typed HTTP status from a 403 export response without reading the blob", async () => {
    const response = new Response(JSON.stringify({
      code: "PERMISSION_DENIED",
      message: "이 작업을 수행할 권한이 없습니다.",
      status: 403,
    }), { status: 403, headers: { "Content-Type": "application/json" } });
    const blob = vi.spyOn(response, "blob");
    vi.mocked(readmatesFetchResponse).mockResolvedValue(response);

    const error = await fetchAdminAnalyticsExport("7d").catch((caught) => caught);
    expect(isReadmatesApiError(error)).toBe(true);
    expect(error).toMatchObject({ status: 403, code: "PERMISSION_DENIED" });
    expect(blob).not.toHaveBeenCalled();
  });
});
