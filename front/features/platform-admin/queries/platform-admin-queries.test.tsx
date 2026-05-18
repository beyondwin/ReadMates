import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import type { PropsWithChildren } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  PlatformAdminClub,
  PlatformAdminDomainResponse,
  PlatformAdminSummaryResponse,
  SupportAccessGrantResponse,
} from "@/features/platform-admin/api/platform-admin-contracts";

vi.mock("@/features/platform-admin/api/platform-admin-api", () => ({
  checkPlatformAdminDomainProvisioning: vi.fn(),
  commitPlatformAdminOnboarding: vi.fn(),
  createSupportAccessGrant: vi.fn(),
  fetchPlatformAdminClubs: vi.fn(),
  fetchPlatformAdminSummary: vi.fn(),
  listSupportAccessGrantsByClub: vi.fn(),
  revokeSupportAccessGrant: vi.fn(),
  updatePlatformAdminClub: vi.fn(),
}));

import {
  checkPlatformAdminDomainProvisioning,
  commitPlatformAdminOnboarding,
  createSupportAccessGrant,
  fetchPlatformAdminClubs,
  fetchPlatformAdminSummary,
  listSupportAccessGrantsByClub,
  revokeSupportAccessGrant,
  updatePlatformAdminClub,
} from "@/features/platform-admin/api/platform-admin-api";
import {
  platformAdminClubsQuery,
  platformAdminKeys,
  platformAdminSummaryQuery,
  platformAdminSupportGrantsQuery,
  useCheckPlatformAdminDomainProvisioningMutation,
  useCommitPlatformAdminOnboardingMutation,
  useCreateSupportAccessGrantMutation,
  useRevokeSupportAccessGrantMutation,
  useUpdatePlatformAdminClubMutation,
} from "./platform-admin-queries";

const club: PlatformAdminClub = {
  clubId: "club-1",
  slug: "reading-sai",
  name: "읽는사이",
  tagline: "함께 읽는 모임",
  about: "공개 소개",
  status: "ACTIVE",
  publicVisibility: "PRIVATE",
  domainCount: 1,
  domainActionRequiredCount: 1,
  firstHostOnboardingState: "ASSIGNED",
};

const summary: PlatformAdminSummaryResponse = {
  platformRole: "OWNER",
  activeClubCount: 1,
  domainActionRequiredCount: 1,
  domains: [],
  domainsRequiringAction: [],
};

const activeDomain: PlatformAdminDomainResponse = {
  id: "domain-1",
  clubId: "club-1",
  hostname: "reading-sai.example.test",
  kind: "SUBDOMAIN",
  status: "ACTIVE",
  desiredState: "ENABLED",
  manualAction: "NONE",
  errorCode: null,
  isPrimary: false,
  verifiedAt: "2026-05-18T00:00:00Z",
  lastCheckedAt: "2026-05-18T00:00:00Z",
};

const grant: SupportAccessGrantResponse = {
  id: "grant-1",
  clubId: "club-1",
  grantedByUserId: "owner-1",
  granteeUserId: "support-1",
  scope: "HOST_SUPPORT_READ",
  reason: "Support review",
  expiresAt: "2099-01-01T00:00:00Z",
  revokedAt: null,
  createdAt: "2026-05-18T00:00:00Z",
};

function createWrapper() {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0, staleTime: 0 },
      mutations: { retry: false },
    },
  });
  function Wrapper({ children }: PropsWithChildren) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  }
  return { client, Wrapper };
}

async function runQuery(query: { queryFn?: (context: never) => unknown }) {
  if (!query.queryFn) {
    throw new Error("Missing queryFn");
  }
  return query.queryFn({} as never);
}

beforeEach(() => {
  vi.mocked(fetchPlatformAdminSummary).mockReset();
  vi.mocked(fetchPlatformAdminClubs).mockReset();
  vi.mocked(listSupportAccessGrantsByClub).mockReset();
  vi.mocked(checkPlatformAdminDomainProvisioning).mockReset();
  vi.mocked(commitPlatformAdminOnboarding).mockReset();
  vi.mocked(updatePlatformAdminClub).mockReset();
  vi.mocked(createSupportAccessGrant).mockReset();
  vi.mocked(revokeSupportAccessGrant).mockReset();
});

describe("platform admin query keys", () => {
  it("defines stable query keys", () => {
    expect(platformAdminKeys.summary()).toEqual(["platform-admin", "summary"]);
    expect(platformAdminKeys.clubs()).toEqual(["platform-admin", "clubs"]);
    expect(platformAdminKeys.supportGrants("club-1")).toEqual([
      "platform-admin",
      "support-grants",
      "club-1",
    ]);
    expect(platformAdminKeys.supportGrants(null)).toEqual([
      "platform-admin",
      "support-grants",
      null,
    ]);
  });

  it("query functions call platform admin API wrappers", async () => {
    vi.mocked(fetchPlatformAdminSummary).mockResolvedValue(summary);
    vi.mocked(fetchPlatformAdminClubs).mockResolvedValue({ items: [club] });
    vi.mocked(listSupportAccessGrantsByClub).mockResolvedValue([grant]);

    await runQuery(platformAdminSummaryQuery());
    await runQuery(platformAdminClubsQuery());
    await runQuery(platformAdminSupportGrantsQuery("club-1"));

    expect(fetchPlatformAdminSummary).toHaveBeenCalledOnce();
    expect(fetchPlatformAdminClubs).toHaveBeenCalledOnce();
    expect(listSupportAccessGrantsByClub).toHaveBeenCalledWith("club-1");
  });

  it("returns an empty grant list for null selected club", async () => {
    await expect(runQuery(platformAdminSupportGrantsQuery(null))).resolves.toEqual([]);
    expect(listSupportAccessGrantsByClub).not.toHaveBeenCalled();
  });
});

describe("platform admin mutation cache behavior", () => {
  it("updates summary domains after a successful domain check", async () => {
    vi.mocked(checkPlatformAdminDomainProvisioning).mockResolvedValue(activeDomain);
    const { client, Wrapper } = createWrapper();
    client.setQueryData(platformAdminKeys.summary(), {
      ...summary,
      domains: [{ ...activeDomain, status: "ACTION_REQUIRED", manualAction: "CLOUDFLARE_PAGES_CUSTOM_DOMAIN" }],
      domainsRequiringAction: [{ ...activeDomain, status: "ACTION_REQUIRED", manualAction: "CLOUDFLARE_PAGES_CUSTOM_DOMAIN" }],
    });
    const { result } = renderHook(() => useCheckPlatformAdminDomainProvisioningMutation(), { wrapper: Wrapper });

    await act(async () => {
      await result.current.mutateAsync("domain-1");
    });

    expect(checkPlatformAdminDomainProvisioning).toHaveBeenCalledWith("domain-1");
    expect(client.getQueryData<PlatformAdminSummaryResponse>(platformAdminKeys.summary())?.domains?.[0].status).toBe("ACTIVE");
    expect(client.getQueryData<PlatformAdminSummaryResponse>(platformAdminKeys.summary())?.domainActionRequiredCount).toBe(0);
  });

  it("prepends created club and returned domain after onboarding commit", async () => {
    vi.mocked(commitPlatformAdminOnboarding).mockResolvedValue({
      club,
      hostOnboarding: {
        kind: "INVITATION_CREATED",
        email: "host@example.com",
        userId: null,
        invitationId: "invite-1",
        acceptUrl: "https://readmates.example/invite/example",
        emailDelivery: { status: "SENT" },
      },
      domain: activeDomain,
    });
    const { client, Wrapper } = createWrapper();
    client.setQueryData(platformAdminKeys.summary(), summary);
    client.setQueryData(platformAdminKeys.clubs(), { items: [] });
    const { result } = renderHook(() => useCommitPlatformAdminOnboardingMutation(), { wrapper: Wrapper });

    await act(async () => {
      await result.current.mutateAsync({
        club: { name: "읽는사이", slug: "reading-sai", tagline: "함께 읽는 모임", about: "공개 소개" },
        firstHost: { email: "host@example.com", name: "Host User" },
      });
    });

    expect(client.getQueryData<{ items: PlatformAdminClub[] }>(platformAdminKeys.clubs())?.items[0]).toEqual(club);
    expect(client.getQueryData<PlatformAdminSummaryResponse>(platformAdminKeys.summary())?.domains?.[0]).toEqual(activeDomain);
  });

  it("replaces a club after update", async () => {
    const updated = { ...club, publicVisibility: "PUBLIC" as const };
    vi.mocked(updatePlatformAdminClub).mockResolvedValue(updated);
    const { client, Wrapper } = createWrapper();
    client.setQueryData(platformAdminKeys.clubs(), { items: [club] });
    const { result } = renderHook(() => useUpdatePlatformAdminClubMutation(), { wrapper: Wrapper });

    await act(async () => {
      await result.current.mutateAsync({ clubId: "club-1", request: { publicVisibility: "PUBLIC" } });
    });

    expect(client.getQueryData<{ items: PlatformAdminClub[] }>(platformAdminKeys.clubs())?.items[0].publicVisibility).toBe("PUBLIC");
  });

  it("adds and removes support grants in the selected club cache", async () => {
    vi.mocked(createSupportAccessGrant).mockResolvedValue(grant);
    vi.mocked(revokeSupportAccessGrant).mockResolvedValue(undefined);
    const { client, Wrapper } = createWrapper();
    client.setQueryData(platformAdminKeys.supportGrants("club-1"), []);
    const createHook = renderHook(() => useCreateSupportAccessGrantMutation("club-1"), { wrapper: Wrapper });
    const revokeHook = renderHook(() => useRevokeSupportAccessGrantMutation("club-1"), { wrapper: Wrapper });

    await act(async () => {
      await createHook.result.current.mutateAsync({
        clubId: "club-1",
        granteeUserId: "support-1",
        scope: "HOST_SUPPORT_READ",
        reason: "Support review",
        expiresAt: "2099-01-01T00:00:00Z",
      });
    });

    expect(client.getQueryData<SupportAccessGrantResponse[]>(platformAdminKeys.supportGrants("club-1"))).toEqual([grant]);

    await act(async () => {
      await revokeHook.result.current.mutateAsync("grant-1");
    });

    expect(client.getQueryData<SupportAccessGrantResponse[]>(platformAdminKeys.supportGrants("club-1"))).toEqual([]);
  });
});
