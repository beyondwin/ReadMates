import {
  InfiniteQueryObserver,
  QueryClient,
  QueryClientProvider,
} from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import type { PropsWithChildren } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ReadMatesSessionExpiredError } from "@/shared/api/client";
import { apiErrorFromResponse } from "@/shared/api/errors";
import type {
  PlatformAdminClub,
  PlatformAdminClubCommandReceipt,
  PlatformAdminClubDetail,
  PlatformAdminOnboardingResultResponse,
  PlatformAdminSummaryResponse,
} from "@/features/platform-admin/api/platform-admin-contracts";
import type { PlatformAdminCapabilities } from "@/features/platform-admin/model/platform-admin-capabilities";

vi.mock("@/features/platform-admin/api/platform-admin-api", () => ({
  checkPlatformAdminDomainProvisioning: vi.fn(),
  commitPlatformAdminOnboarding: vi.fn(),
  confirmPlatformAdminClubVisibility: vi.fn(),
  confirmPlatformAdminDomain: vi.fn(),
  fetchPlatformAdminClub: vi.fn(),
  fetchPlatformAdminClubs: vi.fn(),
  fetchPlatformAdminSummary: vi.fn(),
  previewPlatformAdminClubVisibility: vi.fn(),
  previewPlatformAdminDomain: vi.fn(),
  updatePlatformAdminClubMetadata: vi.fn(),
}));

vi.mock(
  "@/features/platform-admin/api/platform-admin-capabilities-api",
  () => ({
    fetchPlatformAdminCapabilities: vi.fn(),
  }),
);

import {
  checkPlatformAdminDomainProvisioning,
  commitPlatformAdminOnboarding,
  confirmPlatformAdminClubVisibility,
  confirmPlatformAdminDomain,
  fetchPlatformAdminClub,
  fetchPlatformAdminClubs,
  fetchPlatformAdminSummary,
  previewPlatformAdminClubVisibility,
  previewPlatformAdminDomain,
  updatePlatformAdminClubMetadata,
} from "@/features/platform-admin/api/platform-admin-api";
import { fetchPlatformAdminCapabilities } from "@/features/platform-admin/api/platform-admin-capabilities-api";
import {
  installPlatformAdminAuthorityLossHandler,
  platformAdminCapabilitiesQuery,
  platformAdminClubDetailQuery,
  platformAdminClubsInfiniteQuery,
  platformAdminClubsQuery,
  platformAdminKeys,
  platformAdminSummaryQuery,
  purgePlatformAdminState,
  useCheckPlatformAdminDomainProvisioningMutation,
  useCommitPlatformAdminOnboardingMutation,
  useConfirmPlatformAdminClubVisibilityMutation,
  useConfirmPlatformAdminDomainMutation,
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
  adminRevision: 7,
};

const detail: PlatformAdminClubDetail = { ...club, domains: [] };

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
  client.setQueryData(platformAdminKeys.clubs({}), {
    pages: [{ items: [club], nextCursor: null }],
    pageParams: [null],
  });
  client.setQueryData(platformAdminKeys.capabilities(), capabilities);
  client.setQueryData([...platformAdminKeys.all, "operations", "cases"], {
    items: [],
  });
  client.setQueryData(memberQueryKey, memberSnapshot);
  client.setQueryData(publicQueryKey, publicSnapshot);
}

const receipt: PlatformAdminClubCommandReceipt = {
  receiptId: "receipt-1",
  commandType: "club.visibility.change",
  clubId: "club-1",
  beforeAdminRevision: 7,
  afterAdminRevision: 8,
  outcome: "SUCCEEDED",
  resultCode: "VISIBILITY_CHANGED",
  targetId: null,
  convergenceId: null,
  convergenceState: null,
};

const onboardingResult: PlatformAdminOnboardingResultResponse = {
  receiptId: "receipt-onboarding",
  club,
  originStatus: "SUCCEEDED",
  firstHostKind: "INVITATION_CREATED",
  invitationDelivery: "PENDING",
};

function createWrapper() {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0, staleTime: 0 },
      mutations: { retry: false },
    },
  });
  function Wrapper({ children }: PropsWithChildren) {
    return (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
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
  vi.mocked(fetchPlatformAdminClub).mockReset();
  vi.mocked(fetchPlatformAdminCapabilities).mockReset();
  vi.mocked(checkPlatformAdminDomainProvisioning).mockReset();
  vi.mocked(commitPlatformAdminOnboarding).mockReset();
  vi.mocked(confirmPlatformAdminClubVisibility).mockReset();
  vi.mocked(confirmPlatformAdminDomain).mockReset();
  vi.mocked(previewPlatformAdminClubVisibility).mockReset();
  vi.mocked(previewPlatformAdminDomain).mockReset();
  vi.mocked(updatePlatformAdminClubMetadata).mockReset();
});

describe("platform admin query keys", () => {
  it("defines stable query keys", () => {
    expect(platformAdminKeys.summary()).toEqual(["platform-admin", "summary"]);
    expect(platformAdminKeys.clubsRoot()).toEqual(["platform-admin", "clubs"]);
    expect(
      platformAdminKeys.clubs({ search: "sample", lifecycle: "ACTIVE" }),
    ).toEqual([
      "platform-admin",
      "clubs",
      { search: "sample", lifecycle: "ACTIVE" },
    ]);
    expect(platformAdminKeys.club("club-1")).toEqual([
      "platform-admin",
      "club",
      "club-1",
    ]);
    expect(platformAdminKeys.capabilities()).toEqual([
      "platform-admin",
      "capabilities",
    ]);
  });

  it("query functions call platform admin API wrappers", async () => {
    vi.mocked(fetchPlatformAdminSummary).mockResolvedValue(summary);
    vi.mocked(fetchPlatformAdminClubs).mockResolvedValue({
      items: [club],
      nextCursor: null,
    });
    vi.mocked(fetchPlatformAdminClub).mockResolvedValue(detail);
    vi.mocked(fetchPlatformAdminCapabilities).mockResolvedValue(capabilities);

    await runQuery(platformAdminSummaryQuery());
    await runQuery(platformAdminClubsQuery());
    await runQuery(platformAdminClubDetailQuery("club-1"));
    await runQuery(platformAdminCapabilitiesQuery());

    expect(fetchPlatformAdminSummary).toHaveBeenCalledOnce();
    expect(fetchPlatformAdminClubs).toHaveBeenCalledOnce();
    expect(fetchPlatformAdminClub).toHaveBeenCalledWith("club-1");
    expect(fetchPlatformAdminCapabilities).toHaveBeenCalledOnce();
  });

  it("appends cursor pages with the same normalized filter key", async () => {
    vi.mocked(fetchPlatformAdminClubs)
      .mockResolvedValueOnce({ items: [club], nextCursor: "cursor-2" })
      .mockResolvedValueOnce({
        items: [{ ...club, clubId: "club-2" }],
        nextCursor: null,
      });
    const { client } = createWrapper();
    const query = platformAdminClubsInfiniteQuery({
      search: "sample",
      lifecycle: "ACTIVE",
      limit: 25,
    });
    const observer = new InfiniteQueryObserver(client, query);
    const unsubscribe = observer.subscribe(() => undefined);

    await observer.refetch();
    await observer.fetchNextPage();
    unsubscribe();

    expect(fetchPlatformAdminClubs).toHaveBeenNthCalledWith(1, {
      search: "sample",
      lifecycle: "ACTIVE",
      limit: 25,
    });
    expect(fetchPlatformAdminClubs).toHaveBeenNthCalledWith(2, {
      search: "sample",
      lifecycle: "ACTIVE",
      limit: 25,
      cursor: "cursor-2",
    });
    expect(
      client.getQueryData<{ pages: Array<{ items: PlatformAdminClub[] }> }>(
        query.queryKey,
      )?.pages,
    ).toHaveLength(2);
  });

});

describe("platform admin mutation cache behavior", () => {
  it("invalidates authoritative club state after a successful domain check", async () => {
    vi.mocked(checkPlatformAdminDomainProvisioning).mockResolvedValue({
      ...receipt,
      commandType: "club.domain.recheck",
      targetId: "domain-1",
      convergenceId: "convergence-1",
      convergenceState: "PENDING",
    });
    const { client, Wrapper } = createWrapper();
    client.setQueryData(platformAdminKeys.club("club-1"), detail);
    const { result } = renderHook(
      () => useCheckPlatformAdminDomainProvisioningMutation("club-1"),
      { wrapper: Wrapper },
    );

    await act(async () => {
      await result.current.mutateAsync({
        domainId: "domain-1",
        request: {
          idempotencyKey: "intent-recheck",
          expectedStatus: "ACTION_REQUIRED",
        },
      });
    });

    expect(checkPlatformAdminDomainProvisioning).toHaveBeenCalledWith(
      "domain-1",
      {
        idempotencyKey: "intent-recheck",
        expectedStatus: "ACTION_REQUIRED",
      },
    );
    expect(
      client.getQueryState(platformAdminKeys.club("club-1"))?.isInvalidated,
    ).toBe(true);
  });

  it("stores the durable onboarding result and invalidates every registry filter", async () => {
    vi.mocked(commitPlatformAdminOnboarding).mockResolvedValue(
      onboardingResult,
    );
    const { client, Wrapper } = createWrapper();
    const invalidate = vi.spyOn(client, "invalidateQueries");
    client.setQueryData(platformAdminKeys.clubs({ lifecycle: "ACTIVE" }), {
      pages: [],
      pageParams: [],
    });
    const { result } = renderHook(
      () => useCommitPlatformAdminOnboardingMutation(),
      { wrapper: Wrapper },
    );

    let returned: PlatformAdminOnboardingResultResponse | undefined;
    await act(async () => {
      returned = await result.current.mutateAsync({
        previewId: "preview-1",
        idempotencyKey: "intent-onboarding",
        club: {
          name: "읽는사이",
          slug: "reading-sai",
          tagline: "함께 읽는 모임",
          about: "공개 소개",
        },
        firstHost: { email: "contact-fixture", name: "Host User" },
        confirmed: true,
      });
    });

    expect(returned).toEqual(onboardingResult);
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: platformAdminKeys.clubsRoot(),
    });
  });

  it("stores authoritative detail after revision-guarded metadata update", async () => {
    const updated = { ...detail, name: "새 이름", adminRevision: 8 };
    vi.mocked(updatePlatformAdminClubMetadata).mockResolvedValue(updated);
    const { client, Wrapper } = createWrapper();
    client.setQueryData(platformAdminKeys.club("club-1"), detail);
    const { result } = renderHook(() => useUpdatePlatformAdminClubMutation(), {
      wrapper: Wrapper,
    });

    await act(async () => {
      await result.current.mutateAsync({
        clubId: "club-1",
        request: { expectedAdminRevision: 7, name: "새 이름" },
      });
    });

    expect(
      client.getQueryData<PlatformAdminClubDetail>(
        platformAdminKeys.club("club-1"),
      ),
    ).toEqual(updated);
  });

  it("invalidates detail after visibility and domain receipts", async () => {
    vi.mocked(confirmPlatformAdminClubVisibility).mockResolvedValue(receipt);
    vi.mocked(confirmPlatformAdminDomain).mockResolvedValue({
      ...receipt,
      commandType: "club.domain.create",
    });
    const { client, Wrapper } = createWrapper();
    const invalidate = vi.spyOn(client, "invalidateQueries");
    client.setQueryData(platformAdminKeys.club("club-1"), detail);
    const visibility = renderHook(
      () => useConfirmPlatformAdminClubVisibilityMutation("club-1"),
      { wrapper: Wrapper },
    );
    const domain = renderHook(
      () => useConfirmPlatformAdminDomainMutation("club-1"),
      { wrapper: Wrapper },
    );

    await act(async () => {
      await visibility.result.current.mutateAsync({
        previewId: "preview-1",
        idempotencyKey: "intent-visibility",
        expectedAdminRevision: 7,
        targetVisibility: "PUBLIC",
        confirmed: true,
      });
      await domain.result.current.mutateAsync({
        previewId: "preview-2",
        idempotencyKey: "intent-domain",
        expectedAdminRevision: 8,
        hostname: "club.example.test",
        kind: "CUSTOM_DOMAIN",
        isPrimary: true,
        confirmed: true,
      });
    });

    expect(invalidate).toHaveBeenCalledWith({
      queryKey: platformAdminKeys.club("club-1"),
    });
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
    expect(
      client.getQueryData(platformAdminKeys.capabilities()),
    ).toBeUndefined();
    expect(
      client.getQueryData([...platformAdminKeys.all, "operations", "cases"]),
    ).toBeUndefined();
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
    expect(
      client.getQueryData(platformAdminKeys.capabilities()),
    ).toBeUndefined();
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
    expect(
      client.getQueryData([...platformAdminKeys.all, "operations", "cases"]),
    ).toBeUndefined();
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
      client
        .getMutationCache()
        .build(client, {
          mutationKey: platformAdminKeys.all,
          mutationFn: async () => {
            throw error;
          },
        })
        .execute(),
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
    expect(client.getQueryData(platformAdminKeys.capabilities())).toEqual(
      capabilities,
    );
  });
});
