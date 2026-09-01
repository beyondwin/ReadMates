import { afterEach, describe, expect, it, vi } from "vitest";
import receiptFixture from "../../../tests/unit/__fixtures__/platform-admin-takedown-receipt.server.json";
import { confirmAdminPublicTakedown } from "./platform-admin-takedown-api";

describe("platform-admin takedown API", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("sends one exact confirm request and exposes no absent convergence client", async () => {
    const fetchSpy = vi.fn().mockResolvedValue(new Response(JSON.stringify(receiptFixture), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }));
    vi.stubGlobal("fetch", fetchSpy);
    const request = {
      previewId: "40000000-0000-4000-8000-000000000004",
      reasonCategory: "PRIVATE_DATA" as const,
      reason: "Synthetic public safety reason",
      idempotencyKey: "takedown-original-identity-0001",
    };

    await expect(confirmAdminPublicTakedown(request)).resolves.toMatchObject({ receiptId: receiptFixture.receiptId });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(JSON.parse(String(fetchSpy.mock.calls[0]?.[1]?.body))).toEqual(request);
    expect(fetchSpy.mock.calls[0]?.[0]).toBe("/api/bff/api/admin/public-takedowns/confirm");
  });
});
