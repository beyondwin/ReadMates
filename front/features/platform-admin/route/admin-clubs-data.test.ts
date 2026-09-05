import { QueryClient } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PlatformAdminClub } from "@/features/platform-admin/model/platform-admin-domain-types";
import {
  adminClubsLoaderFactory,
  buildAdminClubsLedgerView,
  presentAdminClubForLedger,
} from "./admin-clubs-data";

vi.mock("@/shared/auth/platform-admin-loader", () => ({
  requirePlatformAdminLoaderAuth: vi.fn(async () => ({
    authenticated: true,
    platformAdmin: { role: "OPERATOR" },
  })),
}));

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

const sampleClub = {
  clubId: "club-sample",
  slug: "sample-reading",
  name: "샘플 독서모임",
  tagline: "",
  about: "",
  status: "ACTIVE",
  publicVisibility: "PUBLIC",
  domainCount: 1,
  domainActionRequiredCount: 1,
  notificationFailureCount: 0,
  aiFailureCount: 0,
  firstHostOnboardingState: "ASSIGNED",
} satisfies PlatformAdminClub;

describe("presentAdminClubForLedger", () => {
  it("maps tab counts, icon facts, and review copy from the club list", () => {
    const presented = presentAdminClubForLedger(sampleClub, "/admin/clubs/club-sample");
    const quiet = presentAdminClubForLedger(
      { ...sampleClub, clubId: "club-quiet", domainActionRequiredCount: 0 },
      "/admin/clubs/club-quiet",
    );
    const view = buildAdminClubsLedgerView([presented, quiet], "club-sample");

    expect(view.tabs).toEqual([
      { id: "all", label: "전체", count: 2 },
      { id: "attention", label: "확인 필요", count: 1 },
      { id: "operating", label: "운영 중", count: 1 },
    ]);
    expect(view.selected?.name).toBe("샘플 독서모임");
    expect(view.selected?.facts.map((fact) => fact.icon)).toEqual([
      "people",
      "person",
      "document",
      "link",
    ]);
    expect(view.selected?.review.length).toBeGreaterThan(0);
    expect(presented.operationsFacts?.hostsLabel).toMatch(/호스트/);
    expect(presented.operationsFacts?.membersLabel).toMatch(/멤버/);
    expect(presented.operationsFacts?.recordsLabel).toMatch(/공개 기록/);
    expect(presented.operationsFacts?.domainLabel).toMatch(/도메인/);
  });
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
