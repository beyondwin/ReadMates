import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RouterProvider, createMemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { scopedGuestRouteLoader } from "./club-app-audience-loader";
import { GuestArchiveRoute, GuestHomeRoute, GuestNotesRoute, GuestScopedAppRoute } from "./guest-scoped-app-route";

const LinkComponent = ({ to, children, ...props }: { to: string; children: React.ReactNode; className?: string; style?: React.CSSProperties }) => <a {...props} href={to}>{children}</a>;
const anonymousAuth = { authenticated: false, userId: null, membershipId: null, clubId: null, email: null, displayName: null, accountName: null, role: null, membershipStatus: null, approvalState: "ANONYMOUS" };
const guestShell = { clubName: "읽는 모임", tagline: "함께 읽습니다", navigation: { home: "OPEN", current: "OPEN", notes: "OPEN", archive: "OPEN", sessionDetail: "OPEN", personalSpace: "PREVIEW", personalRecords: "PREVIEW", settings: "LOCKED", notifications: "LOCKED", feedback: "LOCKED", host: "DENY" } };
const notes = (text = "처음") => ({
  sessions: { items: [{ sessionId: "s1", sessionNumber: 1, bookTitle: "책", date: "2026-08-02", questionCount: 0, oneLinerCount: 0, longReviewCount: 0, highlightCount: 1, totalCount: 1 }], nextCursor: null },
  feed: { items: [{ sessionId: "s1", sessionNumber: 1, bookTitle: "책", date: "2026-08-02", authorName: "이름", authorShortName: "이", avatarKey: "book", kind: "HIGHLIGHT" as const, text }], nextCursor: "cursor-1" },
  capabilities: { canWrite: false as const },
});

function mount(initialData = notes(), clubSlug = "alpha") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}><GuestNotesRoute initialData={initialData} clubSlug={clubSlug} appBasePath={`/clubs/${clubSlug}/app`} LinkComponent={LinkComponent} selectedSessionId="s1" /></QueryClientProvider>);
}

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("guest notes route pagination", () => {
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

describe("guest archive route pagination", () => {
  it("deduplicates rapid clicks and maps one successful appended page", async () => {
    let resolve!: (value: Response) => void;
    const fetchMock = vi.fn(() => new Promise<Response>((done) => { resolve = done; }));
    vi.stubGlobal("fetch", fetchMock);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={client}><GuestArchiveRoute initialData={{ items: [{ sessionId: "a1", sessionNumber: 1, title: "첫", bookTitle: "첫 책", bookAuthor: "작가", bookImageUrl: null, date: "2026-08-02", attendance: 1, total: 2, state: "CLOSED" }], nextCursor: "cursor" }} clubSlug="alpha" appBasePath="/clubs/alpha/app" LinkComponent={LinkComponent} /></QueryClientProvider>);
    const loadMore = screen.getByRole("button", { name: "더 보기" });
    fireEvent.click(loadMore);
    fireEvent.click(loadMore);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    resolve(new Response(JSON.stringify({ items: [{ sessionId: "a2", sessionNumber: 2, title: "둘", bookTitle: "다음 책", bookAuthor: "작가", bookImageUrl: null, date: "2026-08-09", attendance: 2, total: 2, state: "CLOSED" }], nextCursor: null }), { status: 200, headers: { "Content-Type": "application/json" } }));
    expect((await screen.findAllByText("다음 책")).length).toBe(2);
  });
});

describe("guest home route recovery", () => {
  it("keeps successful widgets, leaves a failed retry recoverable, then updates only the retried widget", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response("unavailable", { status: 503 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ items: [{ sessionId: "u1", sessionNumber: 2, title: "다음", bookTitle: "복구된 예정 책", bookAuthor: "작가", bookLink: null, bookImageUrl: null, date: "2026-08-09", startTime: "19:00", endTime: "21:00", questionDeadlineAt: "2026-08-08", state: "OPEN" }], nextCursor: null }), { status: 200, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={client}><GuestHomeRoute initialData={{ current: { currentSession: null }, upcoming: { items: [], nextCursor: null }, recentNotes: { items: [{ sessionId: "s1", sessionNumber: 1, bookTitle: "책", date: "2026-08-02", authorName: "이름", authorShortName: "이", avatarKey: "book", kind: "HIGHLIGHT", text: "성공한 노트" }], nextCursor: null }, widgetErrors: { upcoming: { status: 503 } }, capabilities: { canWrite: false } }} clubSlug="alpha" appBasePath="/clubs/alpha/app" returnTo="/clubs/alpha/app" LinkComponent={LinkComponent} /></QueryClientProvider>);
    expect(screen.getByText("성공한 노트")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "더 보기" }));
    expect(await screen.findByRole("button", { name: "다시 시도" })).toBeVisible();
    expect(screen.getByText("성공한 노트")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "다시 시도" }));
    expect(await screen.findByText("복구된 예정 책")).toBeVisible();
    expect(screen.getByText("성공한 노트")).toBeVisible();
    expect(screen.queryByText("기록을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.")).not.toBeInTheDocument();
  });
});
