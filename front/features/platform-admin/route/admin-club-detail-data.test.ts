import { QueryClient } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { adminClubDetailLoaderFactory } from "./admin-club-detail-data";

vi.mock("@/shared/auth/platform-admin-loader", () => ({
  requirePlatformAdminLoaderAuth: vi.fn(async () => ({
    authenticated: true,
    platformAdmin: { role: "OPERATOR" },
  })),
}));

const api = vi.hoisted(() => ({
  fetchClub: vi.fn(),
  fetchOperations: vi.fn(),
}));

vi.mock(
  "@/features/platform-admin/api/platform-admin-api",
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import("@/features/platform-admin/api/platform-admin-api")
    >()),
    fetchPlatformAdminClub: api.fetchClub,
  }),
);

vi.mock(
  "@/features/platform-admin/api/platform-admin-club-operations-api",
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import("@/features/platform-admin/api/platform-admin-club-operations-api")
    >()),
    fetchPlatformAdminClubOperations: api.fetchOperations,
  }),
);

beforeEach(() => {
  vi.clearAllMocks();
  api.fetchClub.mockResolvedValue({ clubId: "c-1" });
  api.fetchOperations.mockRejectedValue(new Error("secondary unavailable"));
});

describe("adminClubDetailLoaderFactory", () => {
  it("loads authoritative identity without coupling navigation to secondary panels", async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    await expect(
      adminClubDetailLoaderFactory(client)({
        params: { clubId: "c-1" },
        request: new Request("https://readmates.test/admin/clubs/c-1"),
      } as never),
    ).resolves.toEqual({ clubId: "c-1" });

    expect(api.fetchClub).toHaveBeenCalledWith("c-1");
    expect(api.fetchOperations).not.toHaveBeenCalled();
  });
});
