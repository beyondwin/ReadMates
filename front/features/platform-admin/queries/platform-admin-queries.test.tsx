import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import type { PropsWithChildren } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ReadMatesSessionExpiredError } from "@/shared/api/client";
import { apiErrorFromResponse } from "@/shared/api/errors";
import type {
  PlatformAdminClub,
  PlatformAdminDomainResponse,
  PlatformAdminSummaryResponse,
  SupportAccessGrantResponse,
} from "@/features/platform-admin/api/platform-admin-contracts";
import type { PlatformAdminCapabilities } from "@/features/platform-admin/model/platform-admin-capabilities";

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

vi.mock("@/features/platform-admin/api/platform-admin-capabilities-api", () => ({
  fetchPlatformAdminCapabilities: vi.fn(),
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
import { fetchPlatformAdminCapabilities } from "@/features/platform-admin/api/platform-admin-capabilities-api";
import {
  installPlatformAdminAuthorityLossHandler,
  platformAdminCapabilitiesQuery,
  platformAdminClubsQuery,
  platformAdminKeys,
  platformAdminSummaryQuery,
  platformAdminSupportGrantsQuery,
  purgePlatformAdminState,
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
  notificationFailureCount: 0,
  aiFailureCount: 0,
  firstHostOnboardingState: "ASSIGNED",
};

const summary: PlatformAdminSummaryResponse = {
  platformRole: "OWNER",
  activeClubCount: 1,
  domainActionRequiredCount: 1,
  domains: [],
  domainsRequiringAction: [],
};

const capabilities: PlatformAdminCapabilities = {
  schemaVersion: 1,
  role: "OWNER",
  status: "ACTIVE",
  capabilities: ["VIEW_TODAY", "VIEW_CLUBS", "CREATE_CLUB"],
  generatedAt: "2026-08-22T00:00:00Z",
};

const memberQueryKey = ["current-session", "me"] as const;
const publicQueryKey = ["public", "club"] as const;
const memberSnapshot = { userId: "member-1" };
const publicSnapshot = { slug: "reading-sai" };

async function forbiddenError() {
  return apiErrorFromResponse(
    new Response(
      JSON.stringify({
        code: "PERMISSION_DENIED",
        message: "이 작업을 수행할 권한이 없습니다.",
        status: 403,
      }),
      { status: 403, headers: { "Content-Type": "application/json" } },
    ),
  );
}

function seedAdminAndUnrelatedQueries(client: QueryClient) {
  client.setQueryData(platformAdminKeys.summary(), summary);
  client.setQueryData(platformAdminKeys.clubs(), { items: [club] });
  client.setQueryData(platformAdminKeys.capabilities(), capabilities);
  client.setQueryData([...platformAdminKeys.all, "operations", "cases"], { items: [] });
  client.setQueryData(memberQueryKey, memberSnapshot);
  client.setQueryData(publicQueryKey, publicSnapshot);
}

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
  vi.mocked(fetchPlatformAdminCapabilities).mockReset();
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
    expect(platformAdminKeys.capabilities()).toEqual(["platform-admin", "capabilities"]);
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
    vi.mocked(fetchPlatformAdminCapabilities).mockResolvedValue(capabilities);
    vi.mocked(listSupportAccessGrantsByClub).mockResolvedValue([grant]);

    await runQuery(platformAdminSummaryQuery());
    await runQuery(platformAdminClubsQuery());
    await runQuery(platformAdminCapabilitiesQuery());
    await runQuery(platformAdminSupportGrantsQuery("club-1"));

    expect(fetchPlatformAdminSummary).toHaveBeenCalledOnce();
    expect(fetchPlatformAdminClubs).toHaveBeenCalledOnce();
    expect(fetchPlatformAdminCapabilities).toHaveBeenCalledOnce();
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

describe("platform admin authority-loss purge", () => {
  it("removes the entire platform-admin prefix without touching member or public queries", () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: 0 } },
    });
    seedAdminAndUnrelatedQueries(client);

    purgePlatformAdminState(client);

    expect(client.getQueryData(platformAdminKeys.summary())).toBeUndefined();
    expect(client.getQueryData(platformAdminKeys.clubs())).toBeUndefined();
    expect(client.getQueryData(platformAdminKeys.capabilities())).toBeUndefined();
    expect(client.getQueryData([...platformAdminKeys.all, "operations", "cases"])).toBeUndefined();
    expect(client.getQueryData(memberQueryKey)).toEqual(memberSnapshot);
    expect(client.getQueryData(publicQueryKey)).toEqual(publicSnapshot);
  });

  it("purges the prefix when a platform-admin query sees 401 without clearing unrelated queries", async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: 0 } },
    });
    installPlatformAdminAuthorityLossHandler(client);
    seedAdminAndUnrelatedQueries(client);

    await expect(
      client.fetchQuery({
        queryKey: [...platformAdminKeys.all, "probe"],
        queryFn: async () => {
          throw new ReadMatesSessionExpiredError();
        },
      }),
    ).rejects.toBeInstanceOf(ReadMatesSessionExpiredError);

    expect(client.getQueryData(platformAdminKeys.summary())).toBeUndefined();
    expect(client.getQueryData(platformAdminKeys.capabilities())).toBeUndefined();
    expect(client.getQueryData(memberQueryKey)).toEqual(memberSnapshot);
    expect(client.getQueryData(publicQueryKey)).toEqual(publicSnapshot);
  });

  it("purges the prefix when a platform-admin query sees 403 without clearing unrelated queries", async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: 0 } },
    });
    installPlatformAdminAuthorityLossHandler(client);
    seedAdminAndUnrelatedQueries(client);
    const error = await forbiddenError();

    await expect(
      client.fetchQuery({
        queryKey: [...platformAdminKeys.all, "probe"],
        queryFn: async () => {
          throw error;
        },
      }),
    ).rejects.toBe(error);

    expect(client.getQueryData(platformAdminKeys.summary())).toBeUndefined();
    expect(client.getQueryData([...platformAdminKeys.all, "operations", "cases"])).toBeUndefined();
    expect(client.getQueryData(memberQueryKey)).toEqual(memberSnapshot);
  });

  it("purges the prefix when a platform-admin mutation sees 403", async () => {
    const client = new QueryClient({
      defaultOptions: { mutations: { retry: false } },
    });
    installPlatformAdminAuthorityLossHandler(client);
    seedAdminAndUnrelatedQueries(client);
    const error = await forbiddenError();

    await expect(
      client.getMutationCache().build(client, {
        mutationKey: platformAdminKeys.all,
        mutationFn: async () => {
          throw error;
        },
      }).execute(),
    ).rejects.toBe(error);

    expect(client.getQueryData(platformAdminKeys.summary())).toBeUndefined();
    expect(client.getQueryData(memberQueryKey)).toEqual(memberSnapshot);
  });

  it("does not purge platform-admin cache when an unrelated member query sees 403", async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: 0 } },
    });
    installPlatformAdminAuthorityLossHandler(client);
    seedAdminAndUnrelatedQueries(client);
    const error = await forbiddenError();

    await expect(
      client.fetchQuery({
        queryKey: memberQueryKey,
        queryFn: async () => {
          throw error;
        },
      }),
    ).rejects.toBe(error);

    expect(client.getQueryData(platformAdminKeys.summary())).toEqual(summary);
    expect(client.getQueryData(platformAdminKeys.capabilities())).toEqual(capabilities);
  });
});
