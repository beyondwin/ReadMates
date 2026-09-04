import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import { adminSupportLoaderFactory } from "./admin-support-data";

vi.mock("@/shared/auth/platform-admin-loader", () => ({
  requirePlatformAdminLoaderAuth: vi.fn(async () => ({
    authenticated: true,
    platformAdmin: { role: "OPERATOR" },
  })),
}));

describe("adminSupportLoader", () => {
  it("strips private and invalid values before any support data is loaded", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const loader = adminSupportLoaderFactory(client);

    try {
      await loader({
        request: new Request("https://readmates.example/admin/support?clubId=club-1&query=private%40example.com&note=secret&granteeSubjectId=subject-1&subject=private&email=private%40example.com&name=private&status=private"),
        params: {},
        context: undefined,
      });
      throw new Error("expected redirect");
    } catch (error) {
      expect(error).toBeInstanceOf(Response);
      expect((error as Response).status).toBe(302);
      expect((error as Response).headers.get("Location")).toBe("/admin/support?clubId=club-1");
      expect((error as Response).headers.get("X-Remix-Replace")).toBe("true");
    }
  });
});
