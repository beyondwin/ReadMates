import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchAdminAuditLedger, searchAdminAuditLedger } from "./platform-admin-audit-api";

function successfulFetch() {
  return vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(JSON.stringify({ items: [], nextCursor: null }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }),
  );
}

afterEach(() => vi.restoreAllMocks());

describe("platform admin audit API", () => {
  it("keeps the signed cursor in the GET continuation request, not the route model", async () => {
    const fetchSpy = successfulFetch();
    await fetchAdminAuditLedger({ range: "7d", clubId: "club-1" }, "signed-cursor");
    expect(fetchSpy.mock.calls[0]?.[0]).toBe(
      "/api/bff/api/admin/audit/events?range=7d&clubId=club-1&cursor=signed-cursor",
    );
  });

  it("sends sensitive search only in a POST body and continues with the signed cursor", async () => {
    const fetchSpy = successfulFetch();
    await searchAdminAuditLedger({ range: "7d", actorRole: "OWNER" }, "private@example.com", "signed-cursor");
    expect(fetchSpy.mock.calls[0]?.[0]).toBe("/api/bff/api/admin/audit/events/search");
    expect(fetchSpy.mock.calls[0]?.[1]?.method).toBe("POST");
    expect(JSON.parse(String(fetchSpy.mock.calls[0]?.[1]?.body))).toEqual({
      range: "7d",
      actorRole: "OWNER",
      sensitiveTarget: "private@example.com",
      cursor: "signed-cursor",
    });
    expect(String(fetchSpy.mock.calls[0]?.[0])).not.toContain("private");
  });
});
