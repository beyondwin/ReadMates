import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GuestHomeRoute } from "@/features/guest-browse/route/guest-scoped-app-route";
import { GuestHomeContent } from "./guest-home";

const LinkComponent = ({
  to,
  children,
  ...props
}: {
  to: string;
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}) => <a {...props} href={to}>{children}</a>;

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("guest member-home composition", () => {
  it("maps the public About shortcut outside the scoped app namespace", () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    render(
      <QueryClientProvider client={client}>
        <GuestHomeRoute
          initialData={{
            current: { currentSession: null },
            upcoming: { items: [], nextCursor: null },
            recentNotes: { items: [], nextCursor: null },
            capabilities: { canWrite: false },
          }}
          clubSlug="alpha"
          appBasePath="/clubs/alpha/app"
          returnTo="/clubs/alpha/app"
          LinkComponent={LinkComponent}
          GuestHomeContent={GuestHomeContent}
        />
      </QueryClientProvider>,
    );

    const aboutLinks = screen.getAllByRole("link", { name: /안내문/ });
    expect(aboutLinks.length).toBeGreaterThan(0);
    aboutLinks.forEach((link) => {
      expect(link).toHaveAttribute("href", "/clubs/alpha/about");
    });
  });

  it("keeps successful widgets, leaves a failed retry recoverable, then updates only the retried widget", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response("unavailable", { status: 503 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        items: [{
          sessionId: "u1",
          sessionNumber: 2,
          title: "다음",
          bookTitle: "복구된 예정 책",
          bookAuthor: "작가",
          bookLink: null,
          bookImageUrl: null,
          date: "2026-08-09",
          startTime: "19:00",
          endTime: "21:00",
          questionDeadlineAt: "2026-08-08",
          state: "OPEN",
        }],
        nextCursor: null,
      }), { status: 200, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    render(
      <QueryClientProvider client={client}>
        <GuestHomeRoute
          initialData={{
            current: { currentSession: null },
            upcoming: { items: [], nextCursor: null },
            recentNotes: {
              items: [{
                sessionId: "s1",
                sessionNumber: 1,
                bookTitle: "책",
                date: "2026-08-02",
                authorName: "이름",
                authorShortName: "이",
                avatarKey: "book",
                kind: "HIGHLIGHT",
                text: "성공한 노트",
              }],
              nextCursor: null,
            },
            widgetErrors: { upcoming: { status: 429, retryAfterSeconds: 17 } },
            capabilities: { canWrite: false },
          }}
          clubSlug="alpha"
          appBasePath="/clubs/alpha/app"
          returnTo="/clubs/alpha/app"
          LinkComponent={LinkComponent}
          GuestHomeContent={GuestHomeContent}
        />
      </QueryClientProvider>,
    );

    expect(screen.getAllByText("성공한 노트")).toHaveLength(2);
    expect(screen.getAllByText("17초 뒤에 다시 시도해 주세요.")).toHaveLength(2);
    await user.click(screen.getAllByRole("button", { name: "다시 시도" })[0]);
    expect(await screen.findByText("다시 불러오지 못했습니다. 재시도해 주세요.")).toBeVisible();
    expect(screen.getAllByText("성공한 노트")).toHaveLength(2);
    await user.click(screen.getAllByRole("button", { name: "다시 시도" })[0]);
    expect((await screen.findAllByText("복구된 예정 책")).length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText("성공한 노트")).toHaveLength(2);
    expect(screen.queryByText("17초 뒤에 다시 시도해 주세요.")).not.toBeInTheDocument();
  });
});
