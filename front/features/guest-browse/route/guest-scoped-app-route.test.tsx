import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GuestArchiveRoute, GuestHomeRoute, GuestNotesRoute } from "./guest-scoped-app-route";

const LinkComponent = ({ to, children, ...props }: { to: string; children: React.ReactNode; className?: string; style?: React.CSSProperties }) => <a {...props} href={to}>{children}</a>;
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

  it("resets visible notes for a different club and fresh same-club loader result", () => {
    const mounted = mount(notes("alpha 기록"), "alpha");
    expect(screen.getByText("alpha 기록")).toBeVisible();
    mounted.rerender(<QueryClientProvider client={new QueryClient()}><GuestNotesRoute key="beta:2" initialData={notes("beta 기록")} clubSlug="beta" appBasePath="/clubs/beta/app" LinkComponent={LinkComponent} selectedSessionId="s1" /></QueryClientProvider>);
    expect(screen.getByText("beta 기록")).toBeVisible();
    expect(screen.queryByText("alpha 기록")).not.toBeInTheDocument();
    mounted.rerender(<QueryClientProvider client={new QueryClient()}><GuestNotesRoute key="beta:3" initialData={notes("새 loader 기록")} clubSlug="beta" appBasePath="/clubs/beta/app" LinkComponent={LinkComponent} selectedSessionId="s1" /></QueryClientProvider>);
    expect(screen.getByText("새 loader 기록")).toBeVisible();
    expect(screen.queryByText("beta 기록")).not.toBeInTheDocument();
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
