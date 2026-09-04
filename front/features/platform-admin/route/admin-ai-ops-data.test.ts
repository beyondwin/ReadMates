import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import { adminAiOpsLoaderFactory } from "./admin-ai-ops-data";

vi.mock("@/shared/auth/platform-admin-loader", () => ({
  requirePlatformAdminLoaderAuth: vi.fn(async () => ({
    authenticated: true,
    platformAdmin: { role: "OPERATOR" },
  })),
}));

describe("adminAiOpsLoaderFactory", () => {
  it("settles disabled and partial read failures so the route can render their honest states", async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    vi.spyOn(queryClient, "fetchQuery").mockRejectedValue(Object.assign(new Error("disabled"), { status: 404 }));
    vi.spyOn(queryClient, "fetchInfiniteQuery").mockRejectedValue(new TypeError("transport unavailable"));

    await expect(
      adminAiOpsLoaderFactory(queryClient)({
        request: new Request("http://localhost/admin/ai-ops?jobId=job-1"),
        params: {},
        context: undefined,
      }),
    ).resolves.toBeNull();
  });
});
