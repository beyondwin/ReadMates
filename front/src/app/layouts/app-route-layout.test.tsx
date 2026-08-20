import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
import {
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
  const openMutation = useOpenHostSessionMutation();
  const closeMutation = useCloseHostSessionMutation();
  const deleteMutation = useDeleteHostSessionMutation();

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

function expectSessionLinks(href: string) {
  const links = screen.getAllByRole("link", { name: "세션" });
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
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("AppRouteLayout host session navigation", () => {
  it.each([
    {
      operation: "open" as const,
      initialSessionId: null,
      nextSessionId: "session-7",
      initialHref: "/app/host/sessions/new",
      nextHref: "/app/host/sessions/session-7",
      mutationPath: "/api/bff/api/host/sessions/session-7/open",
      mutationMethod: "POST",
    },
    {
      operation: "close" as const,
      initialSessionId: "session-7",
      nextSessionId: null,
      initialHref: "/app/host/sessions/session-7",
      nextHref: "/app/host/sessions/new",
      mutationPath: "/api/bff/api/host/sessions/session-7/close",
      mutationMethod: "POST",
    },
    {
      operation: "delete" as const,
      initialSessionId: "session-7",
      nextSessionId: null,
      initialHref: "/app/host/sessions/session-7",
      nextHref: "/app/host/sessions/new",
      mutationPath: "/api/bff/api/host/sessions/session-7",
      mutationMethod: "DELETE",
    },
  ])(
    "refreshes the session destination after a successful $operation mutation",
    async ({
      operation,
      initialSessionId,
      nextSessionId,
      initialHref,
      nextHref,
      mutationPath,
      mutationMethod,
    }) => {
      let currentSessionId = initialSessionId;
      const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
        const path = input.toString();
        if (path === "/api/bff/api/sessions/current") {
          return Promise.resolve(
            jsonResponse({
              currentSession: currentSessionId === null ? null : { sessionId: currentSessionId },
            }),
          );
        }
        if (path === mutationPath && init?.method === mutationMethod) {
          currentSessionId = nextSessionId;
          return Promise.resolve(jsonResponse({}));
        }
        return Promise.reject(new Error(`Unexpected fetch: ${path}`));
      });
      vi.stubGlobal("fetch", fetchMock);
      const queryClient = new QueryClient({
        defaultOptions: {
          queries: { retry: false, staleTime: 0, gcTime: 0 },
          mutations: { retry: false },
        },
      });
      const user = userEvent.setup();

      renderHostLayout({
        queryClient,
        child: <SessionMutationHarness operation={operation} />,
      });

      await waitFor(() => expectSessionLinks(initialHref));
      await user.click(screen.getByRole("button", { name: operation }));
      await waitFor(() => expectSessionLinks(nextHref));

      expect(
        fetchMock.mock.calls.filter(([input]) => input.toString() === "/api/bff/api/sessions/current"),
      ).toHaveLength(2);
    },
  );

  it("distinguishes loading from failure and recovers a transient current-session lookup", async () => {
    const initialRequest = deferred<Response>();
    const retryRequest = deferred<Response>();
    let currentRequest = 0;
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const path = input.toString();
      if (path === "/api/bff/api/sessions/current") {
        currentRequest += 1;
        return currentRequest === 1 ? initialRequest.promise : retryRequest.promise;
      }
      return Promise.reject(new Error(`Unexpected fetch: ${path}`));
    });
    vi.stubGlobal("fetch", fetchMock);
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false, staleTime: 0, gcTime: 0 },
        mutations: { retry: false },
      },
    });
    const user = userEvent.setup();

    renderHostLayout({
      queryClient,
      child: <main>host child</main>,
    });

    expect(screen.getAllByLabelText("세션 불러오는 중")).toHaveLength(2);

    await act(async () => {
      initialRequest.resolve(jsonResponse({ title: "Unavailable" }, 503));
      await initialRequest.promise;
    });

    const retryButtons = await screen.findAllByRole("button", { name: "세션 다시 확인" });
    expect(retryButtons).toHaveLength(2);
    expect(screen.queryByLabelText("세션 불러오는 중")).not.toBeInTheDocument();

    await user.click(retryButtons[0]);

    expect(await screen.findAllByRole("button", { name: "세션 다시 확인 중" })).toHaveLength(2);
    expect(screen.getAllByRole("button", { name: "세션 다시 확인 중" })[0]).toBeDisabled();

    await act(async () => {
      retryRequest.resolve(jsonResponse({ currentSession: { sessionId: "session-9" } }));
      await retryRequest.promise;
    });

    await waitFor(() => expectSessionLinks("/app/host/sessions/session-9"));
    expect(currentRequest).toBe(2);
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
          title: "검증할 세션",
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
      title: "공개 세션",
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
