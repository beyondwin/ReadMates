import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import {
  createMemoryRouter,
  RouterProvider,
  useLocation,
  useNavigate,
} from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PlatformAdminClub } from "@/features/platform-admin/api/platform-admin-contracts";
import { platformAdminClubListFiltersFromSearch } from "@/features/platform-admin/model/platform-admin-club-list-filters";
import {
  platformAdminCapabilitiesQuery,
  platformAdminClubsInfiniteQuery,
} from "@/features/platform-admin/queries/platform-admin-queries";
import { findUnnamedInteractiveElements } from "@/shared/testing/accessibility-checks";
import { AdminClubsRoute } from "./admin-clubs-route";

vi.mock(
  "@/features/platform-admin/api/platform-admin-api",
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import("@/features/platform-admin/api/platform-admin-api")
    >()),
    fetchPlatformAdminClubs: vi.fn(),
  }),
);

import { fetchPlatformAdminClubs } from "@/features/platform-admin/api/platform-admin-api";

const club: PlatformAdminClub = {
  clubId: "c-1",
  slug: "alpha",
  name: "Alpha",
  tagline: "",
  about: "",
  status: "ACTIVE",
  publicVisibility: "PRIVATE",
  domainCount: 1,
  domainActionRequiredCount: 0,
  notificationFailureCount: 0,
  aiFailureCount: 0,
  firstHostOnboardingState: "ASSIGNED",
  adminRevision: 7,
};

function LocationProbe() {
  const location = useLocation();
  const navigate = useNavigate();
  return (
    <>
      <output data-testid="location-search">{location.search}</output>
      <button
        type="button"
        onClick={() => navigate("/admin/clubs?search=restored")}
      >
        URL 검색 변경
      </button>
    </>
  );
}

function renderRoute(
  items: PlatformAdminClub[] = [club],
  initialEntry = "/admin/clubs",
  capabilities = ["VIEW_CLUBS", "CREATE_CLUB"],
  additionalPage?: PlatformAdminClub[] | null,
  locationState?: { focusId?: string | null; scrollTop?: number },
) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  const url = new URL(initialEntry, "https://example.test");
  const filters = platformAdminClubListFiltersFromSearch(url.searchParams);
  const pages =
    additionalPage === null
      ? [{ items, nextCursor: "cursor-2" }]
      : additionalPage
        ? [
            { items, nextCursor: "cursor-2" },
            { items: additionalPage, nextCursor: null },
          ]
        : [{ items, nextCursor: null }];
  const pageParams = Array.isArray(additionalPage)
    ? [undefined, "cursor-2"]
    : [undefined];
  queryClient.setQueryData(platformAdminClubsInfiniteQuery(filters).queryKey, {
    pages,
    pageParams,
  });
  queryClient.setQueryData(
    platformAdminClubsInfiniteQuery({ limit: 25 }).queryKey,
    {
      pages,
      pageParams,
    },
  );
  queryClient.setQueryData(platformAdminCapabilitiesQuery().queryKey, {
    schemaVersion: 1,
    role: "OWNER",
    status: "ACTIVE",
    capabilities,
    generatedAt: "2026-08-24T00:00:00Z",
  });
  const initialEntries = [
    locationState
      ? {
          pathname: url.pathname,
          search: url.search,
          hash: url.hash,
          state: locationState,
        }
      : initialEntry,
  ];
  const router = createMemoryRouter(
    [
      {
        path: "/admin/clubs",
        element: (
          <>
            <LocationProbe />
            <AdminClubsRoute />
          </>
        ),
      },
      { path: "/admin/clubs/:clubId", element: <div>club detail</div> },
    ],
    { initialEntries },
  );
  return render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

describe("AdminClubsRoute", () => {
  beforeEach(() => vi.clearAllMocks());
  it("renders server-ordered registry rows with accessible controls", () => {
    const { container } = renderRoute();
    expect(screen.getByRole("heading", { name: "클럽" })).toBeInTheDocument();
    expect(
      screen.getByRole("searchbox", { name: "클럽 검색" }),
    ).toBeInTheDocument();
    expect(screen.getByText("alpha")).toBeInTheDocument();
    const href = screen.getByRole("link", { name: "Alpha" }).getAttribute("href");
    expect(href).toContain("/admin/clubs/c-1");
    expect(href).toContain("returnTo=%2Fadmin%2Fclubs");
    expect(href).toContain("focusId=c-1");
    expect(findUnnamedInteractiveElements(container)).toEqual([]);
  });

  it("hydrates URL-safe filters and writes filter changes back to the URL", async () => {
    renderRoute(
      [club],
      "/admin/clubs?search=alpha&lifecycle=ACTIVE&visibility=PRIVATE",
    );
    expect(screen.getByRole("searchbox", { name: "클럽 검색" })).toHaveValue(
      "alpha",
    );
    expect(screen.getByRole("combobox", { name: "수명주기" })).toHaveValue(
      "ACTIVE",
    );
    expect(screen.getByRole("combobox", { name: "공개 상태" })).toHaveValue(
      "PRIVATE",
    );

    fireEvent.change(screen.getByRole("combobox", { name: "호스트 온보딩" }), {
      target: { value: "MISSING" },
    });
    await waitFor(() =>
      expect(screen.getByTestId("location-search")).toHaveTextContent(
        "onboardingState=MISSING",
      ),
    );
    expect(screen.getByTestId("location-search")).not.toHaveTextContent(
      "cursor=",
    );
  });

  it("does not expose cursor state and shows a bounded empty state", () => {
    renderRoute([], "/admin/clubs?cursor=private-cursor&search=missing");
    expect(
      screen.getByText("조건에 맞는 클럽이 없습니다."),
    ).toBeInTheDocument();
    expect(screen.queryByText("private-cursor")).not.toBeInTheDocument();
  });

  it("keeps the new-club entry point URL-scoped", () => {
    renderRoute();
    expect(screen.getByRole("link", { name: "새 클럽" })).toHaveAttribute(
      "href",
      "/admin/clubs?onboarding=1",
    );
  });

  it("preserves registry filters when opening onboarding", () => {
    renderRoute([club], "/admin/clubs?search=alpha&visibility=PRIVATE");
    const href = screen
      .getByRole("link", { name: "새 클럽" })
      .getAttribute("href");
    expect(href).toContain("search=alpha");
    expect(href).toContain("visibility=PRIVATE");
    expect(href).toContain("onboarding=1");
  });

  it("syncs the debounced draft when browser navigation changes the search URL", async () => {
    renderRoute([club], "/admin/clubs?search=alpha");
    expect(screen.getByRole("searchbox", { name: "클럽 검색" })).toHaveValue(
      "alpha",
    );
    fireEvent.click(screen.getByRole("button", { name: "URL 검색 변경" }));
    await waitFor(() =>
      expect(screen.getByRole("searchbox", { name: "클럽 검색" })).toHaveValue(
        "restored",
      ),
    );
  });

  it("hides the new-club entry point without CREATE_CLUB", () => {
    renderRoute([club], "/admin/clubs", ["VIEW_CLUBS"]);
    expect(
      screen.queryByRole("link", { name: "새 클럽" }),
    ).not.toBeInTheDocument();
  });

  it("ignores URL filter values outside the bounded server allowlists", () => {
    expect(
      platformAdminClubListFiltersFromSearch(
        new URLSearchParams(
          "lifecycle=DROP&visibility=SECRET&domainStatus=RAW&onboardingState=OWNER",
        ),
      ),
    ).toEqual({ limit: 25 });
    renderRoute(
      [club],
      "/admin/clubs?lifecycle=DROP&visibility=SECRET&domainStatus=RAW&onboardingState=OWNER",
    );
    expect(screen.getByRole("combobox", { name: "수명주기" })).toHaveValue("");
    expect(screen.getByRole("combobox", { name: "공개 상태" })).toHaveValue("");
    expect(screen.getByRole("combobox", { name: "도메인 상태" })).toHaveValue(
      "",
    );
    expect(screen.getByRole("combobox", { name: "호스트 온보딩" })).toHaveValue(
      "",
    );
  });

  it("deduplicates a club repeated at an infinite-page boundary", () => {
    const later = { ...club, name: "Alpha stale duplicate" };
    renderRoute([club], "/admin/clubs", ["VIEW_CLUBS"], [later]);
    expect(screen.getAllByRole("link", { name: /Alpha/ })).toHaveLength(1);
    expect(screen.queryByText("Alpha stale duplicate")).not.toBeInTheDocument();
  });

  it("encodes the current registry filters, row focus, and scroll into the detail href", () => {
    const { container } = renderRoute(
      [club],
      "/admin/clubs?search=alpha&lifecycle=ACTIVE&visibility=PRIVATE&domainStatus=ACTION_REQUIRED&onboardingState=MISSING&onboarding=1",
    );
    const scroller = container.querySelector(
      ".admin-clubs-ledger__scroller",
    ) as HTMLElement;
    Object.defineProperty(scroller, "scrollTop", {
      configurable: true,
      value: 240,
    });
    fireEvent.scroll(scroller);

    const href = screen.getByRole("link", { name: "Alpha" }).getAttribute("href");
    expect(href).toContain("/admin/clubs/c-1?");
    expect(href).toContain("returnTo=%2Fadmin%2Fclubs%3Fsearch%3Dalpha");
    expect(href).toContain("lifecycle%3DACTIVE");
    expect(href).toContain("visibility%3DPRIVATE");
    expect(href).toContain("domainStatus%3DACTION_REQUIRED");
    expect(href).toContain("onboardingState%3DMISSING");
    expect(href).not.toContain("onboarding%3D1");
    expect(href).toContain("focusId=c-1");
    expect(href).toContain("scrollTop=240");
  });

  it("restores row focus and scroll when returning to the filtered list", async () => {
    const { container } = renderRoute(
      [club],
      "/admin/clubs?search=alpha",
      ["VIEW_CLUBS", "CREATE_CLUB"],
      undefined,
      { focusId: "c-1", scrollTop: 240 },
    );

    await waitFor(() =>
      expect(screen.getByRole("link", { name: "Alpha" })).toHaveFocus(),
    );
    expect(
      (container.querySelector(".admin-clubs-ledger__scroller") as HTMLElement)
        .scrollTop,
    ).toBe(240);
  });

  it("does not re-apply return restore after the user moves focus, scroll, or loads more", async () => {
    vi.mocked(fetchPlatformAdminClubs).mockResolvedValue({
      items: [{ ...club, clubId: "c-2", name: "Beta" }],
      nextCursor: null,
    });
    const { container } = renderRoute(
      [club],
      "/admin/clubs",
      ["VIEW_CLUBS", "CREATE_CLUB"],
      null,
      { focusId: "c-1", scrollTop: 240 },
    );
    const scroller = container.querySelector(
      ".admin-clubs-ledger__scroller",
    ) as HTMLElement;
    await waitFor(() =>
      expect(screen.getByRole("link", { name: "Alpha" })).toHaveFocus(),
    );
    expect(scroller.scrollTop).toBe(240);

    const search = screen.getByRole("searchbox", { name: "클럽 검색" });
    search.focus();
    scroller.scrollTop = 12;
    fireEvent.scroll(scroller);

    fireEvent.click(screen.getByRole("button", { name: "더 보기" }));
    expect(await screen.findByRole("link", { name: "Beta" })).toBeInTheDocument();
    expect(search).toHaveFocus();
    expect(scroller.scrollTop).toBe(12);
    expect(screen.getByRole("link", { name: "Alpha" })).not.toHaveFocus();
  });

  it("ignores unsafe restored focus and unbounded scroll", async () => {
    const { container } = renderRoute(
      [club],
      "/admin/clubs",
      ["VIEW_CLUBS", "CREATE_CLUB"],
      undefined,
      { focusId: "../evil", scrollTop: 1_000_001 },
    );

    await waitFor(() =>
      expect(screen.getByRole("link", { name: "Alpha" })).not.toHaveFocus(),
    );
    expect(
      (container.querySelector(".admin-clubs-ledger__scroller") as HTMLElement)
        .scrollTop,
    ).toBe(0);
  });

  it("keeps page-one rows and retries the same cursor after page-two failure", async () => {
    vi.mocked(fetchPlatformAdminClubs)
      .mockRejectedValueOnce(new Error("page two unavailable"))
      .mockResolvedValueOnce({
        items: [{ ...club, clubId: "c-2", name: "Beta" }],
        nextCursor: null,
      });
    renderRoute([club], "/admin/clubs", ["VIEW_CLUBS"], null);

    fireEvent.click(screen.getByRole("button", { name: "더 보기" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "다음 클럽을 불러오지 못했습니다",
    );
    expect(screen.getByRole("link", { name: "Alpha" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "다시 불러오기" }));
    expect(
      await screen.findByRole("link", { name: "Beta" }),
    ).toBeInTheDocument();
    expect(fetchPlatformAdminClubs).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ cursor: "cursor-2" }),
    );
  });
});
