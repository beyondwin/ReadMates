import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
import {
  hostSessionKeys,
  useCloseHostSessionMutation,
  useDeleteHostSessionMutation,
  useOpenHostSessionMutation,
} from "@/features/host/queries/host-session-queries";
import {
  AuthActionsContext,
  AuthContext,
  anonymousAuth,
  type AuthState,
} from "@/src/app/auth-state";
import type { AuthMeResponse } from "@/shared/auth/auth-contracts";
import { __resetHostClientContractCapabilityForTest } from "@/shared/api/host-client-contract";
import { GuestNavigationProvider } from "@/features/guest-browse/ui/guest-navigation-dialog";
import { Link } from "@/src/app/router-link";
import { AppRouteLayout } from "./app-route-layout";

const hostAuth: AuthMeResponse = {
  authenticated: true,
  userId: "host-1",
  membershipId: "membership-host",
  clubId: "club-1",
  email: "host@example.com",
  displayName: "김호스트",
  accountName: "호스트",
  role: "HOST",
  membershipStatus: "ACTIVE",
  approvalState: "ACTIVE",
  avatarKey: "cloud-green-book",
  currentMembership: {
    membershipId: "membership-host",
    clubId: "club-1",
    clubSlug: "reading-sai",
    displayName: "김호스트",
    role: "HOST",
    membershipStatus: "ACTIVE",
    approvalState: "ACTIVE",
    avatarKey: "cloud-green-book",
  },
  joinedClubs: [
    {
      clubId: "club-1",
      clubSlug: "reading-sai",
      clubName: "읽는사이",
      membershipId: "membership-host",
      role: "HOST",
      status: "ACTIVE",
      approvalState: "ACTIVE",
      primaryHost: "김호스트",
    },
  ],
};

const memberAuth: AuthMeResponse = {
  ...hostAuth,
  userId: "member-1",
  membershipId: "membership-member",
  email: "member@example.com",
  displayName: "김멤버",
  accountName: "멤버",
  role: "MEMBER",
};

const mixedAuthorityHostAuth: AuthMeResponse = {
  ...hostAuth,
  joinedClubs: [
    ...hostAuth.joinedClubs,
    {
      clubId: "club-member-only",
      clubSlug: "member-only",
      clubName: "멤버 전용 클럽",
      membershipId: "membership-member-only",
      role: "MEMBER",
      status: "ACTIVE",
      approvalState: "ACTIVE",
      primaryHost: "다른 호스트",
    },
    {
      clubId: "club-host-next",
      clubSlug: "host-next",
      clubName: "다음 호스트 클럽",
      membershipId: "membership-host-next",
      role: "HOST",
      status: "ACTIVE",
      approvalState: "ACTIVE",
      primaryHost: "김호스트",
    },
  ],
};

type Deferred<T> = {
  promise: Promise<T>;
  resolve: (value: T) => void;
};

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((promiseResolve) => {
    resolve = promiseResolve;
  });
  return { promise, resolve };
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

type SessionMutationOperation = "open" | "close" | "delete";

function SessionMutationHarness({ operation }: { operation: SessionMutationOperation }) {
  const mutationContext = { clubSlug: "reading-sai" };
  const openMutation = useOpenHostSessionMutation(mutationContext);
  const closeMutation = useCloseHostSessionMutation(mutationContext);
  const deleteMutation = useDeleteHostSessionMutation(mutationContext);

  const mutate = {
    open: openMutation.mutateAsync,
    close: closeMutation.mutateAsync,
    delete: deleteMutation.mutateAsync,
  }[operation];

  return (
    <main>
      <button type="button" onClick={() => void mutate("session-7")}>
        {operation}
      </button>
    </main>
  );
}

function renderHostLayout({
  queryClient,
  child,
}: {
  queryClient: QueryClient;
  child: React.ReactNode;
}) {
  return render(
    <QueryClientProvider client={queryClient}>
      <AuthActionsContext.Provider value={{ markLoggedOut: vi.fn(), refreshAuth: vi.fn() }}>
        <AuthContext.Provider value={{ status: "ready", auth: hostAuth }}>
          <MemoryRouter initialEntries={["/app/host"]}>
            <Routes>
              <Route path="/app/host" element={<AppRouteLayout />}>
                <Route index element={child} />
              </Route>
            </Routes>
          </MemoryRouter>
        </AuthContext.Provider>
      </AuthActionsContext.Provider>
    </QueryClientProvider>,
  );
}

function renderHostShellAt(
  initialEntry: string,
  initialState?: unknown,
  auth: AuthMeResponse = hostAuth,
  includeLocationProbe = false,
) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: 0, gcTime: 0 },
      mutations: { retry: false },
    },
  });
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 204 })));

  return render(
    <QueryClientProvider client={queryClient}>
      <AuthActionsContext.Provider value={{ markLoggedOut: vi.fn(), refreshAuth: vi.fn() }}>
        <AuthContext.Provider value={{ status: "ready", auth }}>
          <MemoryRouter initialEntries={[initialState === undefined ? initialEntry : { pathname: initialEntry, state: initialState }]}>
            <Routes>
              <Route
                path="*"
                element={(
                  <>
                    <AppRouteLayout scopedAuth={auth} audience="MEMBER" />
                    {includeLocationProbe ? <LocationProbe /> : null}
                  </>
                )}
              />
            </Routes>
          </MemoryRouter>
        </AuthContext.Provider>
      </AuthActionsContext.Provider>
    </QueryClientProvider>,
  );
}

function expectSessionLinks(href: string) {
  const links = screen.getAllByRole("link", { name: /^(?:일정과 )?모임$/ });
  expect(links).toHaveLength(2);
  for (const link of links) {
    expect(link).toHaveAttribute("href", href);
  }
}

function LocationProbe() {
  const location = useLocation();
  return <output aria-label="현재 경로">{`${location.pathname}${location.search}${location.hash}`}</output>;
}

const guestShell = {
  clubName: "읽는사이",
  tagline: "함께 읽습니다",
  navigation: {
    home: "OPEN",
    current: "OPEN",
    notes: "OPEN",
    archive: "OPEN",
    sessionDetail: "OPEN",
    personalSpace: "PREVIEW",
    personalRecords: "PREVIEW",
    settings: "LOCKED",
    notifications: "LOCKED",
    feedback: "LOCKED",
    host: "DENY",
  },
};

const guestCurrentSession = {
  currentSession: {
    sessionId: "current-session",
    sessionNumber: 7,
    title: "현재 모임",
    bookTitle: "현재 책",
    bookAuthor: "현재 작가",
    bookLink: null,
    bookImageUrl: null,
    date: "2026-08-02",
    startTime: "19:00",
    endTime: "21:00",
    questionDeadlineAt: "2026-08-01T19:00:00+09:00",
    attendees: [],
    board: { questions: [], longReviews: [] },
  },
};

function renderScopedExpiryLayout({
  state,
  child,
  initialEntry = "/clubs/reading-sai/app/session/current?tab=questions#draft",
  routePath = "/clubs/:clubSlug/app/session/current",
}: {
  state: AuthState;
  child: React.ReactNode;
  initialEntry?: string;
  routePath?: string;
}) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: Infinity },
      mutations: { retry: false },
    },
  });
  queryClient.setQueryData(["member-private", "reading-sai"], { title: "cached member data" });
  const markLoggedOut = vi.fn();

  const tree = (authState: AuthState) => (
    <QueryClientProvider client={queryClient}>
      <AuthActionsContext.Provider value={{ markLoggedOut, refreshAuth: vi.fn() }}>
        <AuthContext.Provider value={authState}>
          <MemoryRouter initialEntries={[initialEntry]}>
            <Routes>
              <Route
                path={routePath}
                element={<AppRouteLayout scopedAuth={memberAuth} audience="MEMBER" />}
              >
                <Route index element={child} />
              </Route>
            </Routes>
          </MemoryRouter>
        </AuthContext.Provider>
      </AuthActionsContext.Provider>
    </QueryClientProvider>
  );
  const rendered = render(tree(state));

  return {
    queryClient,
    markLoggedOut,
    rerenderState: (nextState: AuthState) => rendered.rerender(tree(nextState)),
  };
}

afterEach(() => {
  cleanup();
  __resetHostClientContractCapabilityForTest();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("AppRouteLayout host session navigation", () => {
  it("renders the four host areas in approved desktop and mobile order while utilities stay outside primary navigation", () => {
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const path = input.toString();
      return Promise.reject(new Error(`Unexpected fetch: ${path}`));
    });
    vi.stubGlobal("fetch", fetchMock);
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false, staleTime: 0, gcTime: 0 },
        mutations: { retry: false },
      },
    });

    renderHostLayout({
      queryClient,
      child: <main>오늘</main>,
    });

    const desktopPrimary = screen.getByRole("navigation", { name: "호스트 주 메뉴" });
    const mobilePrimary = screen.getByRole("navigation", { name: "호스트 주 메뉴 모바일" });
    expect(within(desktopPrimary).getAllByRole("link").map((link) => link.textContent)).toEqual([
      "운영실",
      "일정과 모임",
      "사람",
      "기록",
    ]);
    expect(within(mobilePrimary).getAllByRole("link").map((link) => link.textContent)).toEqual([
      "운영실",
      "모임",
      "사람",
      "기록",
    ]);

    const expectedHrefs = [
      "/app/host",
      "/app/host/sessions",
      "/app/host/people",
      "/app/host/records",
    ];
    expect(within(desktopPrimary).getAllByRole("link").map((link) => link.getAttribute("href"))).toEqual(expectedHrefs);
    expect(within(mobilePrimary).getAllByRole("link").map((link) => link.getAttribute("href"))).toEqual(expectedHrefs);

    for (const utilityLabel of ["초대와 설정", "멤버 시야", "알림", "새 모임"]) {
      expect(within(desktopPrimary).queryByRole("link", { name: utilityLabel })).not.toBeInTheDocument();
      expect(within(mobilePrimary).queryByRole("link", { name: utilityLabel })).not.toBeInTheDocument();
      expect(screen.getAllByRole("link", { name: utilityLabel }).length).toBeGreaterThan(0);
    }

    expect(screen.getAllByRole("button", { name: "읽는사이 · 호스트 운영실" })).toHaveLength(2);
    expect(screen.queryByRole("navigation", { name: "클럽 선택" })).not.toBeInTheDocument();
    expect(screen.queryByRole("navigation", { name: "공간 선택" })).not.toBeInTheDocument();
  });

  it.each([
    ["member-only club", "/clubs/reading-sai/app/host/people", "멤버 전용 클럽", "/clubs/member-only/app"],
    ["host-capable club", "/clubs/reading-sai/app/host/people/member-7", "다음 호스트 클럽", "/clubs/host-next/app/host/people"],
  ])("uses the target club's authority-safe URL for a %s", async (_caseName, initialEntry, clubName, expected) => {
    const user = userEvent.setup();
    renderHostShellAt(initialEntry, undefined, mixedAuthorityHostAuth, true);

    await user.click(screen.getAllByRole("button", { name: "읽는사이 · 호스트 운영실" })[0]);
    await user.click(screen.getAllByRole("button", { name: clubName })[0]);

    expect(screen.getByRole("status", { name: "현재 경로" }).textContent).toBe(expected);
  });

  it.each([
    ["scoped canonical operating room", "/clubs/reading-sai/app/host", "운영실", "운영실", "운영실"],
    ["unscoped operating-room compatibility", "/app/host/operations", "운영실", "운영실", "운영실"],
    ["scoped meetings", "/clubs/reading-sai/app/host/sessions", "일정과 모임", "모임", "모임"],
    ["unscoped people compatibility", "/app/host/members", "사람", "사람", "사람"],
    ["scoped person detail", "/clubs/reading-sai/app/host/people/member-7", "사람", "사람", "사람"],
    ["unscoped records", "/app/host/records", "기록", "기록", "기록"],
    ["scoped record closing", "/clubs/reading-sai/app/host/sessions/session-7/closing", "기록", "기록", "기록"],
    ["utility compatibility", "/app/host/invitations", null, null, "초대와 설정"],
    ["scoped utility", "/clubs/reading-sai/app/host/notifications", null, null, "알림"],
  ])("matches %s through the normalized app pathname", (_name, initialEntry, desktopLabel, mobileLabel, mobileTitle) => {
    renderHostShellAt(initialEntry);

    const desktopPrimary = screen.getByRole("navigation", { name: "호스트 주 메뉴" });
    const mobilePrimary = screen.getByRole("navigation", { name: "호스트 주 메뉴 모바일" });
    const desktopCurrent = within(desktopPrimary).queryByRole("link", { current: "page" });
    const mobileCurrent = within(mobilePrimary).queryByRole("link", { current: "page" });
    expect(document.querySelector(".m-hdr-title")).toHaveTextContent(mobileTitle);

    if (desktopLabel === null || mobileLabel === null) {
      expect(desktopCurrent).not.toBeInTheDocument();
      expect(mobileCurrent).not.toBeInTheDocument();
      return;
    }

    expect(desktopCurrent).toHaveTextContent(desktopLabel);
    expect(mobileCurrent).toHaveTextContent(mobileLabel);
  });

  it("assigns a host session detail to records only when record return state owns it", () => {
    renderHostShellAt("/clubs/reading-sai/app/host/sessions/session-7", {
      recordOwnership: "host-records",
      readmatesReturnTo: "/clubs/reading-sai/app/host/records",
      readmatesReturnLabel: "기록으로",
    });

    for (const navigation of [
      screen.getByRole("navigation", { name: "호스트 주 메뉴" }),
      screen.getByRole("navigation", { name: "호스트 주 메뉴 모바일" }),
    ]) {
      expect(within(navigation).getByRole("link", { current: "page" })).toHaveTextContent("기록");
    }
  });

  it.each([
    {
      operation: "open" as const,
      mutationPath: "/api/bff/api/host/sessions/session-7/open?clubSlug=reading-sai",
      mutationMethod: "POST",
    },
    {
      operation: "close" as const,
      mutationPath: "/api/bff/api/host/sessions/session-7/close?clubSlug=reading-sai",
      mutationMethod: "POST",
    },
    {
      operation: "delete" as const,
      mutationPath: "/api/bff/api/host/sessions/session-7?clubSlug=reading-sai",
      mutationMethod: "DELETE",
    },
  ])(
    "keeps the meeting-list destination stable after a successful $operation mutation",
    async ({
      operation,
      mutationPath,
      mutationMethod,
    }) => {
      const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
        const path = input.toString();
        if (path === "/api/bff/__internal/client-contract-status") {
          return Promise.resolve(new Response(JSON.stringify({
            schemaVersion: 1,
            supportedHostClientContracts: ["v3"],
          }), {
            status: 200,
            headers: {
              "Content-Type": "application/json",
              "Cache-Control": "no-store",
            },
          }));
        }
        if (path === "/api/bff/api/sessions/current") {
          return Promise.resolve(jsonResponse({ currentSession: null }));
        }
        if (path === mutationPath && init?.method === mutationMethod) {
          if (mutationMethod === "DELETE") {
            return Promise.resolve(jsonResponse({
              sessionId: "session-7",
              sessionNumber: 7,
              title: "휴지통 모임",
              state: "DRAFT",
              deletedAt: "2026-08-01T00:00:00Z",
              purgeAfter: "2026-08-08T00:00:00Z",
              trashed: true,
              sessionRevision: 4,
              counts: {
                participants: 0,
                rsvpResponses: 0,
                questions: 0,
                checkins: 0,
                oneLineReviews: 0,
                longReviews: 0,
                highlights: 0,
                publications: 0,
                feedbackReports: 0,
                feedbackDocuments: 0,
              },
            }));
          }
          return Promise.resolve(jsonResponse({}));
        }
        return Promise.reject(new Error(`Unexpected fetch: ${path}`));
      });
      vi.stubGlobal("fetch", fetchMock);
      const queryClient = new QueryClient({
        defaultOptions: {
          queries: {
            retry: false,
            staleTime: Number.POSITIVE_INFINITY,
            gcTime: Number.POSITIVE_INFINITY,
          },
          mutations: { retry: false },
        },
      });
      const mutationContext = { clubSlug: "reading-sai" };
      queryClient.setQueryData(hostSessionKeys.detail("session-7", mutationContext), {
        versions: { sessionRevision: 3 },
      });
      queryClient.setQueryData(hostSessionKeys.closingStatus("session-7", mutationContext), {
        session: {
          sessionRevision: 3,
          participantSetRevision: 4,
          attendanceSnapshotId: "attendance-snapshot-4",
        },
      });
      const user = userEvent.setup();

      renderHostLayout({
        queryClient,
        child: <SessionMutationHarness operation={operation} />,
      });

      expectSessionLinks("/app/host/sessions");
      await user.click(screen.getByRole("button", { name: operation }));
      await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
        mutationPath,
        expect.objectContaining({ method: mutationMethod }),
      ));
      expectSessionLinks("/app/host/sessions");

    },
  );

  it("does not fetch current-session identity for stable shell destinations", () => {
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const path = input.toString();
      return Promise.reject(new Error(`Unexpected fetch: ${path}`));
    });
    vi.stubGlobal("fetch", fetchMock);
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false, staleTime: 0, gcTime: 0 },
        mutations: { retry: false },
      },
    });
    renderHostLayout({
      queryClient,
      child: <main>host child</main>,
    });

    expectSessionLinks("/app/host/sessions");
    expect(screen.queryByLabelText("모임 불러오는 중")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "모임 다시 확인" })).not.toBeInTheDocument();
    expect(
      fetchMock.mock.calls.filter(([input]) => input.toString() === "/api/bff/api/sessions/current"),
    ).toHaveLength(0);
  });
});

describe("AppRouteLayout guest shell", () => {
  it("omits persistent conversion and public-home actions from both guest headers", () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });

    render(
      <QueryClientProvider client={queryClient}>
        <AuthActionsContext.Provider value={{ markLoggedOut: vi.fn(), refreshAuth: vi.fn() }}>
          <AuthContext.Provider value={{ status: "ready", auth: anonymousAuth }}>
            <MemoryRouter initialEntries={["/clubs/reading-sai/app/archive?view=report#sessions"]}>
              <GuestNavigationProvider LinkComponent={Link}>
                <Routes>
                  <Route
                    path="/clubs/:clubSlug/app/archive"
                    element={<AppRouteLayout scopedAuth={anonymousAuth} audience="GUEST" />}
                  >
                    <Route index element={<main>guest archive</main>} />
                  </Route>
                </Routes>
              </GuestNavigationProvider>
            </MemoryRouter>
          </AuthContext.Provider>
        </AuthActionsContext.Provider>
      </QueryClientProvider>,
    );

    const desktopHeader = document.querySelector<HTMLElement>(".desktop-only .topnav");
    const mobileHeader = document.querySelector<HTMLElement>(".mobile-only .m-hdr");
    expect(desktopHeader).not.toBeNull();
    expect(mobileHeader).not.toBeNull();
    for (const header of [desktopHeader!, mobileHeader!]) {
      expect(within(header).queryByLabelText("게스트 계정")).not.toBeInTheDocument();
      expect(within(header).queryByRole("link", { name: "공개 홈으로 나가기" })).not.toBeInTheDocument();
      expect(within(header).queryByRole("link", { name: "멤버로 시작" })).not.toBeInTheDocument();
    }
    expect(screen.queryByLabelText("게스트 계정")).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "공개 홈으로 나가기" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "멤버로 시작" })).not.toBeInTheDocument();
  });
});

describe("AppRouteLayout workspace authority", () => {
  it("derives the same-meeting host role-switch destination in app chrome", () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });

    render(
      <QueryClientProvider client={queryClient}>
        <AuthActionsContext.Provider value={{ markLoggedOut: vi.fn(), refreshAuth: vi.fn() }}>
          <AuthContext.Provider value={{ status: "ready", auth: hostAuth }}>
            <MemoryRouter initialEntries={["/clubs/reading-sai/app/sessions/meeting-7"]}>
              <Routes>
                <Route
                  path="/clubs/:clubSlug/app/sessions/:sessionId"
                  element={<AppRouteLayout scopedAuth={hostAuth} audience="MEMBER" />}
                >
                  <Route index element={<main>member record</main>} />
                </Route>
              </Routes>
            </MemoryRouter>
          </AuthContext.Provider>
        </AuthActionsContext.Provider>
      </QueryClientProvider>,
    );

    expect(screen.getAllByRole("link", { name: "호스트 공간" })).toHaveLength(2);
    for (const link of screen.getAllByRole("link", { name: "호스트 공간" })) {
      expect(link).toHaveAttribute("href", "/clubs/reading-sai/app/host/sessions/meeting-7");
    }
    expect(document.querySelectorAll("[data-app-route-security-controller]")).toHaveLength(1);
  });

  it("replaces a revoked host route with its member-safe destination", async () => {
    window.sessionStorage.removeItem("readmates:last-safe-workspace-target:member");
    window.sessionStorage.removeItem("readmates:last-safe-workspace-target:host");
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });

    render(
      <QueryClientProvider client={queryClient}>
        <AuthActionsContext.Provider value={{ markLoggedOut: vi.fn(), refreshAuth: vi.fn() }}>
          <AuthContext.Provider value={{ status: "ready", auth: memberAuth }}>
            <MemoryRouter initialEntries={["/clubs/reading-sai/app/host/sessions/meeting-7"]}>
              <Routes>
                <Route path="/clubs/:clubSlug/app" element={<AppRouteLayout scopedAuth={memberAuth} audience="MEMBER" />}>
                  <Route path="host/sessions/:sessionId" element={<main>revoked host record</main>} />
                  <Route path="archive" element={<main>member archive</main>} />
                </Route>
              </Routes>
            </MemoryRouter>
          </AuthContext.Provider>
        </AuthActionsContext.Provider>
      </QueryClientProvider>,
    );

    expect(await screen.findByText("member archive")).toBeInTheDocument();
  });

  it("keeps a canonical member record route in member chrome despite a stale host workspace hint", () => {
    window.sessionStorage.setItem("readmates:mobile-workspace", "host");
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL) => {
        if (input.toString().includes("/api/bff/api/sessions/current")) {
          return Promise.resolve(jsonResponse({ currentSession: null }));
        }
        return Promise.reject(new Error(`Unexpected fetch: ${input.toString()}`));
      }),
    );
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });

    render(
      <QueryClientProvider client={queryClient}>
        <AuthActionsContext.Provider value={{ markLoggedOut: vi.fn(), refreshAuth: vi.fn() }}>
          <AuthContext.Provider value={{ status: "ready", auth: hostAuth }}>
            <MemoryRouter initialEntries={["/clubs/reading-sai/app/sessions/meeting-7"]}>
              <Routes>
                <Route
                  path="/clubs/:clubSlug/app/sessions/:sessionId"
                  element={<AppRouteLayout scopedAuth={hostAuth} audience="MEMBER" />}
                >
                  <Route index element={<main>member record</main>} />
                </Route>
              </Routes>
            </MemoryRouter>
          </AuthContext.Provider>
        </AuthActionsContext.Provider>
      </QueryClientProvider>,
    );

    expect(document.querySelector(".mobile-only .m-hdr")).toHaveAttribute("data-workspace", "member");
    expect(document.querySelector(".mobile-only .m-tabbar")).toHaveAttribute("data-variant", "member");
  });

  it("falls back inside the current club when member record return state points at another club", () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });

    render(
      <QueryClientProvider client={queryClient}>
        <AuthActionsContext.Provider value={{ markLoggedOut: vi.fn(), refreshAuth: vi.fn() }}>
          <AuthContext.Provider value={{ status: "ready", auth: hostAuth }}>
            <MemoryRouter initialEntries={[{
              pathname: "/clubs/reading-sai/app/sessions/meeting-7",
              state: {
                readmatesReturnTo: "/clubs/another-club/app/archive?view=report#meeting-7",
                readmatesReturnLabel: "다른 클럽 기록으로",
              },
            }]}>
              <Routes>
                <Route
                  path="/clubs/:clubSlug/app/sessions/:sessionId"
                  element={<AppRouteLayout scopedAuth={hostAuth} audience="MEMBER" />}
                >
                  <Route index element={<main><h1>멤버 기록</h1></main>} />
                </Route>
              </Routes>
            </MemoryRouter>
          </AuthContext.Provider>
        </AuthActionsContext.Provider>
      </QueryClientProvider>,
    );

    const mobileHeader = document.querySelector<HTMLElement>(".mobile-only .m-hdr");
    expect(mobileHeader).not.toBeNull();
    expect(within(mobileHeader!).getByRole("link", { name: "뒤로" })).toHaveAttribute(
      "href",
      "/clubs/reading-sai/app/archive?view=sessions",
    );
  });
});

describe("AppRouteLayout session expiry recovery", () => {
  it("retains successful read content and offers exact-route reauth or guest continuation", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const path = input.toString();
      if (path === "/api/bff/api/public/clubs/reading-sai/browse") {
        return Promise.resolve(jsonResponse(guestShell));
      }
      if (path === "/api/bff/api/public/clubs/reading-sai/browse/sessions/current") {
        return Promise.resolve(jsonResponse(guestCurrentSession));
      }
      if (path === "/api/bff/api/auth/logout") {
        return Promise.resolve(new Response(null, { status: 204 }));
      }
      return Promise.reject(new Error(`Unexpected fetch: ${path}`));
    });
    vi.stubGlobal("fetch", fetchMock);
    const { queryClient, markLoggedOut } = renderScopedExpiryLayout({
      state: { status: "session_expired", cause: "read", episode: 1, lastAuth: memberAuth } as AuthState,
      child: (
        <>
          <main data-testid="cached-read">cached member data</main>
          <LocationProbe />
        </>
      ),
    });

    expect(screen.getByTestId("cached-read")).toBeVisible();
    expect(screen.getByRole("status", { name: "로그인 세션 만료" })).toBeVisible();
    expect(screen.getByRole("link", { name: "재로그인" })).toHaveAttribute(
      "href",
      "/login?returnTo=%2Fclubs%2Freading-sai%2Fapp%2Fsession%2Fcurrent%3Ftab%3Dquestions%23draft",
    );
    const continueButton = await screen.findByRole("button", { name: "게스트로 계속 보기" });
    await user.click(continueButton);

    await waitFor(() => expect(markLoggedOut).toHaveBeenCalledTimes(1));
    expect(queryClient.getQueryData(["member-private", "reading-sai"])).toBeUndefined();
    expect(screen.getByRole("status", { name: "현재 경로" })).toHaveTextContent(
      "/clubs/reading-sai/app/session/current?tab=questions#draft",
    );
  });

  it("keeps an unsaved write draft mounted and offers only explicit reauthentication", async () => {
    const user = userEvent.setup();
    renderScopedExpiryLayout({
      state: { status: "session_expired", cause: "write", episode: 1, lastAuth: memberAuth } as AuthState,
      child: <textarea aria-label="작성 중인 질문" defaultValue="지워지면 안 되는 질문" />,
    });

    const draft = screen.getByRole("textbox", { name: "작성 중인 질문" });
    await user.type(draft, " 이어쓰기");

    expect(draft).toHaveValue("지워지면 안 되는 질문 이어쓰기");
    expect(screen.getByRole("status", { name: "로그인 세션 만료" })).toBeVisible();
    expect(screen.getByRole("link", { name: "재로그인" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "게스트로 계속 보기" })).not.toBeInTheDocument();
  });

  it("does not offer guest continuation until the exact session detail is guest-readable", async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const path = input.toString();
      if (path === "/api/bff/api/public/clubs/reading-sai/browse") {
        return Promise.resolve(jsonResponse(guestShell));
      }
      if (path === "/api/bff/api/public/clubs/reading-sai/browse/archive/private-session") {
        return Promise.resolve(new Response(null, { status: 404 }));
      }
      return Promise.reject(new Error(`Unexpected fetch: ${path}`));
    });
    vi.stubGlobal("fetch", fetchMock);

    renderScopedExpiryLayout({
      state: { status: "session_expired", cause: "read", episode: 1, lastAuth: memberAuth } as AuthState,
      child: <main>private member session detail</main>,
      initialEntry: "/clubs/reading-sai/app/sessions/private-session",
      routePath: "/clubs/:clubSlug/app/sessions/:sessionId",
    });

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/bff/api/public/clubs/reading-sai/browse/archive/private-session",
        expect.objectContaining({ cache: "no-store" }),
      );
    });
    expect(screen.queryByRole("button", { name: "게스트로 계속 보기" })).not.toBeInTheDocument();
    expect(screen.getByText("private member session detail")).toBeVisible();
    expect(await screen.findByText(/게스트로 이어볼 수 없어 다시 로그인/)).toBeVisible();
  });

  it("verifies the exact notes session and cursor before enabling guest continuation", async () => {
    const noteSession = {
      sessionId: "session-7",
      sessionNumber: 7,
      bookTitle: "검증할 책",
      date: "2026-08-02",
      questionCount: 1,
      oneLinerCount: 0,
      longReviewCount: 0,
      highlightCount: 0,
      totalCount: 1,
    };
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const path = input.toString();
      if (path === "/api/bff/api/public/clubs/reading-sai/browse") {
        return Promise.resolve(jsonResponse(guestShell));
      }
      if (path === "/api/bff/api/public/clubs/reading-sai/browse/notes/sessions?limit=20&cursor=cursor-2") {
        return Promise.resolve(jsonResponse({ items: [noteSession], nextCursor: null }));
      }
      if (path === "/api/bff/api/public/clubs/reading-sai/browse/notes/feed?limit=20&cursor=cursor-2&sessionId=session-7") {
        return Promise.resolve(jsonResponse({
          items: [{
            sessionId: "session-7",
            sessionNumber: 7,
            bookTitle: "검증할 책",
            date: "2026-08-02",
            authorName: "공개 작성자",
            authorShortName: "공",
            avatarKey: "book",
            kind: "QUESTION",
            text: "공개 질문",
          }],
          nextCursor: null,
        }));
      }
      if (path === "/api/bff/api/public/clubs/reading-sai/browse/archive/session-7") {
        return Promise.resolve(jsonResponse({
          sessionId: "session-7",
          sessionNumber: 7,
          title: "검증할 모임",
          bookTitle: "검증할 책",
          bookAuthor: "작가",
          bookImageUrl: null,
          date: "2026-08-02",
          attendance: 1,
          total: 1,
          state: "CLOSED",
          summary: null,
          highlights: [],
          questions: [],
          oneLiners: [],
          longReviews: [],
        }));
      }
      return Promise.reject(new Error(`Unexpected fetch: ${path}`));
    });
    vi.stubGlobal("fetch", fetchMock);

    renderScopedExpiryLayout({
      state: { status: "session_expired", cause: "read", episode: 7, lastAuth: memberAuth } as AuthState,
      child: <main>기존 노트 데이터</main>,
      initialEntry: "/clubs/reading-sai/app/notes?sessionId=session-7&cursor=cursor-2#question",
      routePath: "/clubs/:clubSlug/app/notes",
    });

    expect(await screen.findByRole("button", { name: "게스트로 계속 보기" })).toBeVisible();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/bff/api/public/clubs/reading-sai/browse/notes/sessions?limit=20&cursor=cursor-2",
      expect.objectContaining({ cache: "no-store" }),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/bff/api/public/clubs/reading-sai/browse/notes/feed?limit=20&cursor=cursor-2&sessionId=session-7",
      expect.objectContaining({ cache: "no-store" }),
    );
    expect(screen.getByText("기존 노트 데이터")).toBeVisible();
  });

  it("rechecks publication at click time and never logs out into a newly private route", async () => {
    const user = userEvent.setup();
    let detailChecks = 0;
    const detail = {
      sessionId: "session-7",
      sessionNumber: 7,
      title: "공개 모임",
      bookTitle: "책",
      bookAuthor: "작가",
      bookImageUrl: null,
      date: "2026-08-02",
      attendance: 1,
      total: 1,
      state: "CLOSED",
      summary: "요약",
      highlights: [],
      questions: [],
      oneLiners: [],
      longReviews: [],
    };
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const path = input.toString();
      if (path === "/api/bff/api/public/clubs/reading-sai/browse") {
        return Promise.resolve(jsonResponse(guestShell));
      }
      if (path === "/api/bff/api/public/clubs/reading-sai/browse/archive/session-7") {
        detailChecks += 1;
        return Promise.resolve(
          detailChecks === 1 ? jsonResponse(detail) : new Response(null, { status: 404 }),
        );
      }
      if (path === "/api/bff/api/auth/logout") {
        return Promise.resolve(new Response(null, { status: 204 }));
      }
      return Promise.reject(new Error(`Unexpected fetch: ${path}`));
    });
    vi.stubGlobal("fetch", fetchMock);
    const { markLoggedOut } = renderScopedExpiryLayout({
      state: { status: "session_expired", cause: "read", episode: 9, lastAuth: memberAuth } as AuthState,
      child: <main>멤버 전용 성공 데이터</main>,
      initialEntry: "/clubs/reading-sai/app/sessions/session-7?view=summary#questions",
      routePath: "/clubs/:clubSlug/app/sessions/:sessionId",
    });

    await user.click(await screen.findByRole("button", { name: "게스트로 계속 보기" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("게스트 화면으로 전환하지 못했습니다");
    expect(markLoggedOut).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalledWith(
      "/api/bff/api/auth/logout",
      expect.anything(),
    );
    expect(screen.getByText("멤버 전용 성공 데이터")).toBeVisible();
  });

  it("does not reuse a successful verification from a previous expiry episode", async () => {
    let shellChecks = 0;
    const secondShell = deferred<Response>();
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const path = input.toString();
      if (path === "/api/bff/api/public/clubs/reading-sai/browse") {
        shellChecks += 1;
        return shellChecks === 1 ? Promise.resolve(jsonResponse(guestShell)) : secondShell.promise;
      }
      if (path === "/api/bff/api/public/clubs/reading-sai/browse/sessions/current") {
        return Promise.resolve(jsonResponse(guestCurrentSession));
      }
      return Promise.reject(new Error(`Unexpected fetch: ${path}`));
    });
    vi.stubGlobal("fetch", fetchMock);
    const { rerenderState } = renderScopedExpiryLayout({
      state: { status: "session_expired", cause: "read", episode: 1, lastAuth: memberAuth } as AuthState,
      child: <main>성공 데이터</main>,
    });

    expect(await screen.findByRole("button", { name: "게스트로 계속 보기" })).toBeVisible();
    rerenderState({
      status: "session_expired",
      cause: "read",
      episode: 2,
      lastAuth: memberAuth,
    } as AuthState);

    expect(screen.queryByRole("button", { name: "게스트로 계속 보기" })).not.toBeInTheDocument();
    expect(screen.getByText(/공개 화면으로 이어볼 수 있는지 확인/)).toBeVisible();

    await act(async () => {
      secondShell.resolve(new Response(null, { status: 404 }));
      await secondShell.promise;
    });
    expect(await screen.findByText(/게스트로 이어볼 수 없어 다시 로그인/)).toBeVisible();
  });
});
