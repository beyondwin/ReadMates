import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { MemoryRouter, RouterProvider, createMemoryRouter, useLocation, useSearchParams } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { scopedGuestRouteLoader } from "./club-app-audience-loader";
import { GuestArchiveRoute, GuestNotesRoute, GuestScopedAppRoute, type GuestArchiveContentProps, type GuestCurrentSessionContentProps } from "./guest-scoped-app-route";

const LinkComponent = ({ to, children, ...props }: { to: string; children: React.ReactNode; className?: string; style?: React.CSSProperties }) => <a {...props} href={to}>{children}</a>;
const anonymousAuth = { authenticated: false, userId: null, membershipId: null, clubId: null, email: null, displayName: null, accountName: null, role: null, membershipStatus: null, approvalState: "ANONYMOUS" };
const guestShell = { clubName: "읽는 모임", tagline: "함께 읽습니다", navigation: { home: "OPEN", current: "OPEN", notes: "OPEN", archive: "OPEN", sessionDetail: "OPEN", personalSpace: "PREVIEW", personalRecords: "PREVIEW", settings: "LOCKED", notifications: "LOCKED", feedback: "LOCKED", host: "DENY" } };
const notes = (text = "처음") => ({
  sessions: { items: [{ sessionId: "s1", sessionNumber: 1, bookTitle: "책", date: "2026-08-02", questionCount: 0, oneLinerCount: 0, longReviewCount: 0, highlightCount: 1, totalCount: 1 }], nextCursor: null },
  feed: { items: [{ sessionId: "s1", sessionNumber: 1, bookTitle: "책", date: "2026-08-02", authorName: "이름", authorShortName: "이", avatarKey: "book", kind: "HIGHLIGHT" as const, text }], nextCursor: "cursor-1" },
  capabilities: { canWrite: false as const },
});

const guestCurrentSession = {
  currentSession: {
    sessionId: "session-open",
    sessionNumber: 12,
    title: "여름의 독서",
    bookTitle: "파도",
    bookAuthor: "작가",
    bookLink: null,
    bookImageUrl: null,
    date: "2026-08-09",
    startTime: "19:00",
    endTime: "21:00",
    questionDeadlineAt: "2026-08-08T23:59:00",
    attendees: [{ displayName: "읽는이", avatarKey: "book", rsvpStatus: "GOING", attendanceStatus: "UNKNOWN" }],
    board: {
      questions: [{ priority: 1, text: "다가오는 질문", draftThought: "초안 생각", authorName: "읽는이", authorShortName: "읽는", avatarKey: "book" }],
      longReviews: [{ title: "서평", content: "공개 서평", authorName: "읽는이", authorShortName: "읽는", avatarKey: "book" }],
    },
  },
} as const;

function mount(initialData = notes(), clubSlug = "alpha") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<MemoryRouter initialEntries={[`/clubs/${clubSlug}/app/notes?sessionId=s1&source=guest`]}><GuestRouteLocation /><QueryClientProvider client={client}><GuestNotesRoute initialData={initialData} clubSlug={clubSlug} appBasePath={`/clubs/${clubSlug}/app`} LinkComponent={LinkComponent} selectedSessionId="s1" /></QueryClientProvider></MemoryRouter>);
}

function GuestRouteLocation() {
  const location = useLocation();

  return <output aria-label="guest notes route">{`${location.pathname}${location.search}`}</output>;
}

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("guest notes route pagination", () => {
  it("uses the shared feed controls while preserving the guest session and filter URL state", async () => {
    const user = userEvent.setup();
    mount();

    expect(screen.getByText("세션을 먼저 고르고, 하이라이트·한줄평·질문을 작성자와 함께 훑는 클럽 기록장입니다.")).toBeVisible();
    expect(screen.getByLabelText("세션 검색")).toBeVisible();
    expect(screen.getByRole("button", { name: "전체 보기" })).toBeVisible();
    expect(screen.getByLabelText("클럽 노트 필터")).toBeVisible();

    await user.click(screen.getByRole("button", { name: "하이라이트 1" }));

    expect(screen.getByLabelText("guest notes route")).toHaveTextContent("/clubs/alpha/app/notes?sessionId=s1&source=guest&filter=highlights");
    const selectedLinks = screen.getAllByRole("link", { name: "No.01 책 세션 보기" });
    expect(selectedLinks.some((link) => link.getAttribute("href") === "/clubs/alpha/app/notes?sessionId=s1&filter=highlights")).toBe(true);
  });

  it("resets through GuestScopedAppRoute on club navigation and fresh same-club loader data", async () => {
    const dataByClub: Record<string, ReturnType<typeof notes>> = { alpha: notes("alpha 처음"), beta: notes("beta 기록") };
    const router = createMemoryRouter([{ path: "/clubs/:clubSlug/app/notes", loader: ({ params }) => ({ guestRoute: true, guestData: dataByClub[params.clubSlug ?? "alpha"] }), element: <GuestScopedAppRoute LinkComponent={LinkComponent} /> }], { initialEntries: ["/clubs/alpha/app/notes"] });
    render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><RouterProvider router={router} /></QueryClientProvider>);
    expect(await screen.findByText("alpha 처음")).toBeVisible();
    dataByClub.alpha = notes("alpha 새 loader");
    await act(async () => { router.revalidate(); });
    expect(await screen.findByText("alpha 새 loader")).toBeVisible();
    expect(screen.queryByText("alpha 처음")).not.toBeInTheDocument();
    await act(async () => { await router.navigate("/clubs/beta/app/notes"); });
    expect(await screen.findByText("beta 기록")).toBeVisible();
    expect(screen.queryByText("alpha 새 loader")).not.toBeInTheDocument();
  });

  it("uses one fetch and one append for rapid load-more clicks", async () => {
    const user = userEvent.setup();
    let resolve!: (value: Response) => void;
    const fetchMock = vi.fn(() => new Promise<Response>((done) => { resolve = done; }));
    vi.stubGlobal("fetch", fetchMock);
    mount();
    await user.dblClick(screen.getByRole("button", { name: "더 보기" }));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    resolve(new Response(JSON.stringify({ items: [{ sessionId: "s1", sessionNumber: 1, bookTitle: "책", date: "2026-08-02", authorName: "다음", authorShortName: "다", avatarKey: "book", kind: "HIGHLIGHT", text: "다음 기록" }], nextCursor: null }), { status: 200, headers: { "Content-Type": "application/json" } }));
    expect(await screen.findByText("다음 기록")).toBeVisible();
    expect(screen.getAllByText("다음 기록")).toHaveLength(1);
  });

  it("keeps retry recoverable after a rejected page and appends only the successful retry", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response("busy", { status: 503 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ items: [{ sessionId: "s1", sessionNumber: 1, bookTitle: "책", date: "2026-08-02", authorName: "다음", authorShortName: "다", avatarKey: "book", kind: "HIGHLIGHT", text: "복구 기록" }], nextCursor: null }), { status: 200, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    mount();
    await user.click(screen.getByRole("button", { name: "더 보기" }));
    expect(await screen.findByRole("button", { name: "다시 시도" })).toBeVisible();
    await user.click(screen.getByRole("button", { name: "다시 시도" }));
    expect(await screen.findByText("복구 기록")).toBeVisible();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("deduplicates and appends the note-session next page through the QueryClient controller", async () => {
    let resolve!: (value: Response) => void;
    const fetchMock = vi.fn(() => new Promise<Response>((done) => { resolve = done; }));
    vi.stubGlobal("fetch", fetchMock);
    mount({ ...notes(), sessions: { ...notes().sessions, nextCursor: "session-cursor" }, feed: { ...notes().feed, nextCursor: null } });
    const loadMore = screen.getAllByRole("button", { name: "더 보기" })[0];
    fireEvent.click(loadMore);
    fireEvent.click(loadMore);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    resolve(new Response(JSON.stringify({ items: [{ sessionId: "s2", sessionNumber: 2, bookTitle: "다음 세션 책", date: "2026-08-09", questionCount: 0, oneLinerCount: 0, longReviewCount: 0, highlightCount: 0, totalCount: 0 }], nextCursor: null }), { status: 200, headers: { "Content-Type": "application/json" } }));
    expect((await screen.findAllByText("다음 세션 책")).length).toBe(2);
  });

  it("keeps note-session pagination retryable after rejection", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response("busy", { status: 503 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ items: [{ sessionId: "s2", sessionNumber: 2, bookTitle: "복구 세션 책", date: "2026-08-09", questionCount: 0, oneLinerCount: 0, longReviewCount: 0, highlightCount: 0, totalCount: 0 }], nextCursor: null }), { status: 200, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    mount({ ...notes(), sessions: { ...notes().sessions, nextCursor: "session-cursor" }, feed: { ...notes().feed, nextCursor: null } });
    await user.click(screen.getAllByRole("button", { name: "더 보기" })[0]);
    await user.click(await screen.findByRole("button", { name: "다시 시도" }));
    expect((await screen.findAllByText("복구 세션 책")).length).toBe(2);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe("guest public route errors", () => {
  function mountPublicFailure(failure: { status: number; retryAfterSeconds?: number }) {
    const loader = vi.fn(() => ({ guestRoute: true, guestFailure: failure }));
    const router = createMemoryRouter([{ path: "/clubs/:clubSlug/app/notes", loader, element: <GuestScopedAppRoute LinkComponent={LinkComponent} /> }], { initialEntries: ["/clubs/alpha/app/notes"] });
    render(<RouterProvider router={router} />);
    return loader;
  }

  it("renders a zero-second Retry-After and revalidates a guest 429", async () => {
    const loader = mountPublicFailure({ status: 429, retryAfterSeconds: 0 });
    expect(await screen.findByText("0초 뒤에 다시 시도해 주세요.")).toBeVisible();
    await userEvent.setup().click(screen.getByRole("button", { name: "다시 시도" }));
    await waitFor(() => expect(loader).toHaveBeenCalledTimes(2));
  });

  it("renders a public 5xx failure and revalidates without member-only messaging", async () => {
    const loader = mountPublicFailure({ status: 503 });
    expect(await screen.findByText("잠시 후 다시 시도해 주세요.")).toBeVisible();
    expect(screen.queryByText(/로그인|멤버/)).not.toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole("button", { name: "다시 시도" }));
    await waitFor(() => expect(loader).toHaveBeenCalledTimes(2));
  });

  it.each([new Response("missing", { status: 404 }), new Error("programming failure")])("renders the normal error boundary for a rethrown guest child failure", async (failure) => {
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(anonymousAuth), { status: 200, headers: { "Content-Type": "application/json" } }))
      .mockResolvedValueOnce(new Response(JSON.stringify(guestShell), { status: 200, headers: { "Content-Type": "application/json" } })));
    const router = createMemoryRouter([{
      path: "/clubs/:clubSlug/app/notes",
      loader: scopedGuestRouteLoader(async () => async () => ({ member: true }), async () => { throw failure; }),
      element: <GuestScopedAppRoute LinkComponent={LinkComponent} />,
      errorElement: <p>normal route boundary</p>,
    }], { initialEntries: ["/clubs/alpha/app/notes"] });
    render(<RouterProvider router={router} />);
    expect(await screen.findByText("normal route boundary")).toBeVisible();
  });
});

describe("guest current session route", () => {
  it("delegates guest current-session loader data to the route-composed reader", async () => {
    const GuestCurrentSessionContent = ({ data }: GuestCurrentSessionContentProps) => (
      <p>{(data as typeof guestCurrentSession).currentSession.bookTitle}</p>
    );
    const router = createMemoryRouter([{
      path: "/clubs/:clubSlug/app/session/current",
      loader: () => ({ guestRoute: true, guestData: guestCurrentSession }),
      element: <GuestScopedAppRoute LinkComponent={LinkComponent} GuestCurrentSessionContent={GuestCurrentSessionContent} />,
    }], { initialEntries: ["/clubs/alpha/app/session/current"] });

    render(<RouterProvider router={router} />);

    expect(await screen.findByText("파도")).toBeVisible();
  });
});

describe("guest archive route pagination", () => {
  const archivePage = (nextCursor: string | null = "cursor") => ({
    items: [{ sessionId: "a1", sessionNumber: 1, title: "첫", bookTitle: "첫 책", bookAuthor: "작가", bookImageUrl: null, date: "2026-08-02", attendance: 1, total: 2, state: "CLOSED" }],
    nextCursor,
  });
  function TestGuestArchiveContent({ data, feedbackLockedAction, onLoadMoreSessions }: GuestArchiveContentProps) {
    const [showFeedback, setShowFeedback] = useState(false);
    const [, setSearchParams] = useSearchParams();

    return <main>
      {["세션", "피드백 문서", "내 질문", "내 서평"].map((tab) => <button key={tab} type="button" onClick={() => {
        if (tab === "피드백 문서") {
          setSearchParams({ view: "report" }, { replace: true });
          setShowFeedback(true);
        }
      }}>{tab}</button>)}
      {data.items.map((session) => <a key={session.sessionId} href={`/app/sessions/${session.sessionId}`} aria-label={`No.${session.sessionNumber} ${session.bookTitle} 열기`}>{session.bookTitle}</a>)}
      {showFeedback ? feedbackLockedAction : null}
      {data.nextCursor ? <button type="button" onClick={() => void onLoadMoreSessions()}>더 보기</button> : null}
    </main>;
  }

  it("uses all regular tabs and injects the scoped login action only after feedback selection", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <MemoryRouter initialEntries={["/clubs/alpha/app/archive?source=guest"]}>
        <QueryClientProvider client={client}>
          <GuestArchiveRoute initialData={archivePage(null)} clubSlug="alpha" appBasePath="/clubs/alpha/app" LinkComponent={LinkComponent} GuestArchiveContent={TestGuestArchiveContent} />
        </QueryClientProvider>
      </MemoryRouter>,
    );

    for (const tabName of ["세션", "피드백 문서", "내 질문", "내 서평"]) {
      expect(screen.getByRole("button", { name: tabName })).toBeVisible();
    }
    expect(screen.queryByRole("link", { name: "멤버로 시작" })).not.toBeInTheDocument();

    await userEvent.setup().click(screen.getByRole("button", { name: "피드백 문서" }));

    for (const action of screen.getAllByRole("link", { name: "멤버로 시작" })) {
      expect(action).toHaveAttribute(
        "href",
        "/login?returnTo=%2Fclubs%2Falpha%2Fapp%2Farchive%3Fview%3Dreport",
      );
    }
  });

  it("deduplicates rapid clicks and maps one successful appended page", async () => {
    let resolve!: (value: Response) => void;
    const fetchMock = vi.fn(() => new Promise<Response>((done) => { resolve = done; }));
    vi.stubGlobal("fetch", fetchMock);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<MemoryRouter initialEntries={["/clubs/alpha/app/archive"]}><QueryClientProvider client={client}><GuestArchiveRoute initialData={archivePage()} clubSlug="alpha" appBasePath="/clubs/alpha/app" LinkComponent={LinkComponent} GuestArchiveContent={TestGuestArchiveContent} /></QueryClientProvider></MemoryRouter>);
    const loadMore = screen.getByRole("button", { name: "더 보기" });
    fireEvent.click(loadMore);
    fireEvent.click(loadMore);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    resolve(new Response(JSON.stringify({ items: [{ sessionId: "a2", sessionNumber: 2, title: "둘", bookTitle: "다음 책", bookAuthor: "작가", bookImageUrl: null, date: "2026-08-09", attendance: 2, total: 2, state: "CLOSED" }], nextCursor: null }), { status: 200, headers: { "Content-Type": "application/json" } }));
    expect(await screen.findByRole("link", { name: "No.2 다음 책 열기" })).toBeVisible();
  });
});
