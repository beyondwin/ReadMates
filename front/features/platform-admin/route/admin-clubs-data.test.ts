import { QueryClient } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { adminClubsLoaderFactory } from "./admin-clubs-data";

const api = vi.hoisted(() => ({ fetchClubs: vi.fn() }));

vi.mock(
  "@/features/platform-admin/api/platform-admin-api",
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import("@/features/platform-admin/api/platform-admin-api")
    >()),
    fetchPlatformAdminClubs: api.fetchClubs,
  }),
);

beforeEach(() => {
  vi.clearAllMocks();
  api.fetchClubs.mockResolvedValue({ items: [], nextCursor: null });
});

describe("adminClubsLoaderFactory", () => {
  it("prefetches the URL's bounded filters without forwarding invalid values", async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    await adminClubsLoaderFactory(client)({
      request: new Request(
        "https://readmates.test/admin/clubs?search=alpha&lifecycle=ACTIVE&visibility=SECRET&domainStatus=FAILED&onboardingState=INVITED",
      ),
    } as never);

    expect(api.fetchClubs).toHaveBeenCalledWith({
      search: "alpha",
      lifecycle: "ACTIVE",
      domainStatus: "FAILED",
      onboardingState: "INVITED",
      limit: 25,
      cursor: undefined,
    });
  });
});
