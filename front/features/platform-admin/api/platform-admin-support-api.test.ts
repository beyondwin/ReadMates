import { afterEach, describe, expect, it, vi } from "vitest";
import {
  confirmAdminSupportGrant,
  fetchAdminSupportGrantLedger,
  previewAdminSupportGrant,
  searchAdminSupportSubjects,
} from "./platform-admin-support-api";

function successfulFetch(body: unknown) {
  return vi.spyOn(globalThis, "fetch").mockImplementation(() => Promise.resolve(new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  })));
}

afterEach(() => vi.restoreAllMocks());

describe("platform admin support API", () => {
  it("sends sensitive search text only in a POST body", async () => {
    const fetchSpy = successfulFetch([]);
    await searchAdminSupportSubjects("private.member@example.com", "club-1");

    expect(fetchSpy.mock.calls[0]?.[0]).toBe("/api/bff/api/admin/support/search");
    expect(fetchSpy.mock.calls[0]?.[1]?.method).toBe("POST");
    expect(JSON.parse(String(fetchSpy.mock.calls[0]?.[1]?.body))).toEqual({
      query: "private.member@example.com",
      clubId: "club-1",
    });
  });

  it("uses only canonical cursor, preview and confirm routes", async () => {
    const fetchSpy = successfulFetch({ items: [], nextCursor: null });
    await fetchAdminSupportGrantLedger({ clubId: "club-1", status: "ACTIVE" }, "opaque-cursor");
    expect(fetchSpy.mock.calls[0]?.[0]).toBe(
      "/api/bff/api/admin/support/grants?clubId=club-1&status=ACTIVE&cursor=opaque-cursor",
    );
    const draft = { clubId: "club-1", granteeSubjectId: "subject-1", scope: "HOST_SUPPORT_READ" as const, expiresAt: "2026-08-25T12:00:00Z", reasonCategory: "MEMBER_ASSISTANCE" as const, note: null };
    await previewAdminSupportGrant(draft);
    expect(fetchSpy.mock.calls[1]?.[0]).toBe("/api/bff/api/admin/support/grants/preview");
    await confirmAdminSupportGrant({ ...draft, previewId: "preview-1", idempotencyKey: "support-intent-1", confirmed: true });
    expect(fetchSpy.mock.calls[2]?.[0]).toBe("/api/bff/api/admin/support/grants/confirm");
    expect(fetchSpy.mock.calls.map((call) => String(call[0])).join("\n")).not.toContain("support-access-grants");
  });
});
