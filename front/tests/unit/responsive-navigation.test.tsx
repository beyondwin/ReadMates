import { cleanup, render, screen, within } from "@testing-library/react";
import type { ReactElement } from "react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TopNav } from "@/shared/ui/top-nav";
import { MobileHeader } from "@/shared/ui/mobile-header";
import { MobileTabBar } from "@/shared/ui/mobile-tab-bar";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function renderAt(pathname: string, element: ReactElement) {
  return render(<MemoryRouter initialEntries={[pathname]}>{element}</MemoryRouter>);
}

describe("TopNav responsive variants", () => {
  it("links the guest public record tab to the public record entry route", () => {
    renderAt("/", <TopNav />);

    const nav = screen.getByRole("navigation", { name: "공개 내비게이션" });
    expect(within(nav).getByRole("link", { name: "공개 기록" })).toHaveAttribute("href", "/records");
  });

  it("keeps guest desktop navigation scoped to the public club slug", () => {
    renderAt("/clubs/reading-sai", <TopNav publicBasePath="/clubs/reading-sai" />);

    const nav = screen.getByRole("navigation", { name: "공개 내비게이션" });
    expect(within(nav).getByRole("link", { name: "소개" })).toHaveAttribute("href", "/clubs/reading-sai");
    expect(within(nav).getByRole("link", { name: "클럽" })).toHaveAttribute("href", "/clubs/reading-sai/about");
    expect(within(nav).getByRole("link", { name: "공개 기록" })).toHaveAttribute("href", "/clubs/reading-sai/records");
  });

  it("renders member desktop navigation with the current app section marked", () => {
    renderAt("/app/session/current", <TopNav variant="member" memberName="이멤버5" />);

    const nav = screen.getByRole("navigation", { name: "앱 내비게이션" });
    expect(within(nav).getByRole("link", { name: "홈" })).toHaveAttribute("href", "/app");
    expect(within(nav).getByRole("link", { name: "이번 세션" })).toHaveAttribute("href", "/app/session/current");
    expect(within(nav).getByRole("link", { name: "클럽 노트" })).toHaveAttribute("href", "/app/notes");
    expect(within(nav).getByRole("link", { name: "아카이브" })).toHaveAttribute("href", "/app/archive");
    expect(within(nav).getByRole("link", { name: "알림" })).toHaveAttribute("href", "/app/notifications");
    expect(within(nav).getByRole("link", { name: "내 공간" })).toHaveAttribute("href", "/app/me");
    expect(within(nav).getByRole("link", { name: "이번 세션" })).toHaveAttribute("aria-current", "page");
    expect(screen.queryByRole("link", { name: "호스트 화면" })).not.toBeInTheDocument();
    expect(screen.getByLabelText("이멤버5")).toHaveTextContent("이");
  });

  it("keeps member desktop navigation inside the scoped app route", () => {
    renderAt("/clubs/reading-sai/app/archive", <TopNav variant="member" memberName="이멤버5" appBasePath="/clubs/reading-sai/app" />);

    const nav = screen.getByRole("navigation", { name: "앱 내비게이션" });
    expect(within(nav).getByRole("link", { name: "홈" })).toHaveAttribute("href", "/clubs/reading-sai/app");
    expect(within(nav).getByRole("link", { name: "아카이브" })).toHaveAttribute("href", "/clubs/reading-sai/app/archive");
    expect(within(nav).getByRole("link", { name: "아카이브" })).toHaveAttribute("aria-current", "page");
  });

  it("shows a desktop host workspace entry only when requested from member navigation", () => {
    renderAt("/app", <TopNav variant="member" memberName="김호스트" showHostEntry />);

    const nav = screen.getByRole("navigation", { name: "앱 내비게이션" });
    expect(within(nav).getAllByRole("link").map((link) => link.textContent)).toEqual([
      "홈",
      "이번 세션",
      "클럽 노트",
      "아카이브",
      "알림",
      "내 공간",
    ]);
    const hostEntry = screen.getByRole("link", { name: "호스트 화면" });
    expect(hostEntry).toHaveAttribute("href", "/app/host");
    expect(hostEntry).toHaveClass("rm-workspace-switch");
    expect(hostEntry.textContent).toBe("");
  });

  it("marks archive active for member session detail routes on desktop", () => {
    renderAt("/app/sessions/session-6", <TopNav variant="member" memberName="이멤버5" />);

    const nav = screen.getByRole("navigation", { name: "앱 내비게이션" });
    expect(within(nav).getByRole("link", { name: "아카이브" })).toHaveAttribute("aria-current", "page");
    expect(within(nav).getByRole("link", { name: "이번 세션" })).not.toHaveAttribute("aria-current");
  });

  it("marks archive active for feedback document routes on desktop", () => {
    renderAt("/app/feedback/session-6", <TopNav variant="member" memberName="이멤버5" />);

    const nav = screen.getByRole("navigation", { name: "앱 내비게이션" });
    expect(within(nav).getByRole("link", { name: "아카이브" })).toHaveAttribute("aria-current", "page");
    expect(within(nav).getByRole("link", { name: "이번 세션" })).not.toHaveAttribute("aria-current");
  });

  it("renders host desktop workspace navigation with the required labels and member return action", () => {
    renderAt("/app/host/sessions/new", <TopNav variant="host" memberName="김호스트" />);

    const nav = screen.getByRole("navigation", { name: "앱 내비게이션" });
    expect(within(nav).getAllByRole("link").map((link) => link.textContent)).toEqual([
      "운영",
      "세션 문서",
      "알림 발송",
      "멤버 초대",
      "멤버 승인",
    ]);
    expect(within(nav).getByRole("link", { name: "운영" })).toHaveAttribute("href", "/app/host");
    expect(within(nav).getByRole("link", { name: "세션 문서" })).toHaveAttribute("href", "/app/host/sessions/new");
    expect(within(nav).getByRole("link", { name: "알림 발송" })).toHaveAttribute("href", "/app/host/notifications");
    expect(within(nav).getByRole("link", { name: "세션 문서" })).toHaveAttribute("aria-current", "page");
    const memberReturn = screen.getByRole("link", { name: "멤버 화면으로" });
    expect(memberReturn).toHaveAttribute("href", "/app");
    expect(memberReturn).toHaveClass("rm-workspace-switch");
    expect(memberReturn.textContent).toBe("");
    expect(screen.getByRole("link", { name: /읽는사이/ })).toHaveAttribute("href", "/app/host");
    expect(screen.getByLabelText("김호스트")).toHaveTextContent("김");
  });

  it("uses the shared brand mark on desktop and mobile headers", () => {
    const desktop = renderAt("/app", <TopNav variant="member" memberName="이멤버5" />);

    expect(desktop.container.querySelector(".topnav .rm-brand-mark")).toBeInTheDocument();

    cleanup();

    const mobile = renderAt("/app", <MobileHeader variant="member" />);

    expect(mobile.container.querySelector(".m-hdr-brand .rm-brand-mark")).toBeInTheDocument();
    expect(mobile.container.querySelector(".m-hdr-mark")).not.toBeInTheDocument();
  });
});

describe("MobileHeader route titles and actions", () => {
  it("keeps mobile header side rails present when actions change", () => {
    const { container } = render(
      <MemoryRouter initialEntries={["/app/host/sessions/session-6/edit"]}>
        <MobileHeader variant="host" />
      </MemoryRouter>,
    );

    const sides = container.querySelectorAll(".m-hdr-side");
    expect(sides).toHaveLength(2);
    expect(container.querySelector(".m-hdr-side--right .m-hdr-link--icon")).toBeInTheDocument();
    expect(container.querySelector(".m-hdr-side--right")).not.toHaveTextContent("멤버");
    expect(screen.getByText("호스트")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "뒤로" })).toHaveAttribute("href", "/app/host");
    expect(screen.getByRole("link", { name: "뒤로" }).textContent).toBe("");
    expect(screen.getByRole("link", { name: "뒤로" })).toHaveClass("m-hdr-back--icon");
    expect(screen.getByRole("link", { name: "뒤로" }).querySelector(".rm-brand-mark")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "멤버 화면으로" })).toHaveAttribute("href", "/app");
    expect(screen.getByRole("link", { name: "멤버 화면으로" })).toHaveClass("m-hdr-link--icon");
    expect(screen.getByRole("link", { name: "멤버 화면으로" }).textContent).toBe("");
  });

  it("keeps scoped host mobile header actions inside the scoped app route", () => {
    renderAt("/clubs/reading-sai/app/host/sessions/session-6/edit", <MobileHeader variant="host" appBasePath="/clubs/reading-sai/app" />);

    expect(screen.getByText("세션")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "뒤로" })).toHaveAttribute("href", "/clubs/reading-sai/app/host");
    expect(screen.getByRole("link", { name: "멤버 화면으로" })).toHaveAttribute("href", "/clubs/reading-sai/app");
  });

  it("renders the public session mobile title and authenticated entry action", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ authenticated: true }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );

    const { container } = renderAt("/sessions/session-6", <MobileHeader variant="guest" />);

    expect(container.querySelector(".m-hdr-title")).toHaveTextContent("공개 기록");
    expect(screen.getByRole("link", { name: "뒤로" })).toHaveAttribute("href", "/records");
    expect(screen.getByRole("link", { name: "뒤로" })).toHaveTextContent("뒤로");
    expect(await screen.findByRole("link", { name: "멤버 화면" })).toHaveAttribute("href", "/app");
  });

  it("keeps public club session mobile chrome scoped to the club slug", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ authenticated: false }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );

    const { container } = renderAt(
      "/clubs/reading-sai/sessions/session-6",
      <MobileHeader variant="guest" publicBasePath="/clubs/reading-sai" />,
    );

    expect(container.querySelector(".m-hdr-title")).toHaveTextContent("공개 기록");
    expect(screen.getByRole("link", { name: "뒤로" })).toHaveAttribute("href", "/clubs/reading-sai/records");
    expect(await screen.findByRole("link", { name: "로그인" })).toHaveAttribute("href", "/login");
  });

  it("renders the public records index mobile title", () => {
    renderAt("/records", <MobileHeader variant="guest" />);

    expect(screen.getByText("공개 기록")).toBeInTheDocument();
  });

  it("keeps public club invite mobile back link scoped to the club slug", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ authenticated: true }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );

    renderAt("/clubs/reading-sai/invite/sample-token", <MobileHeader variant="guest" publicBasePath="/clubs/reading-sai" />);

    expect(screen.getByText("로그인")).toBeInTheDocument();
    expect(await screen.findByRole("link", { name: "뒤로" })).toHaveAttribute("href", "/clubs/reading-sai");
    expect(screen.queryByRole("link", { name: "멤버 화면" })).not.toBeInTheDocument();
  });

  it("keeps the public login mobile back link instead of replacing it with auth entry", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ authenticated: true }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );

    renderAt("/login", <MobileHeader variant="guest" />);

    expect(screen.getByText("로그인")).toBeInTheDocument();
    expect(await screen.findByRole("link", { name: "뒤로" })).toHaveAttribute("href", "/");
    expect(screen.queryByRole("link", { name: "멤버 화면" })).not.toBeInTheDocument();
  });

  it("keeps invite entry mobile chrome focused on accepting the invitation", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ authenticated: true }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );

    renderAt("/invite/sample-token", <MobileHeader variant="guest" />);

    expect(screen.getByText("로그인")).toBeInTheDocument();
    expect(await screen.findByRole("link", { name: "뒤로" })).toHaveAttribute("href", "/");
    expect(screen.queryByRole("link", { name: "멤버 화면" })).not.toBeInTheDocument();
  });

  it("renders member mobile home chrome without host clutter by default", () => {
    renderAt("/app", <MobileHeader variant="member" />);

    expect(screen.getByText("읽는사이")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "호스트 화면" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "멤버 화면으로" })).not.toBeInTheDocument();
  });

  it("renders member notes as a secondary mobile page with a back link", () => {
    renderAt("/app/notes", <MobileHeader variant="member" />);

    expect(screen.getByText("클럽 노트")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "뒤로" })).toHaveAttribute("href", "/app");
    expect(screen.getByRole("link", { name: "뒤로" }).textContent).toBe("");
    expect(screen.getByRole("link", { name: "뒤로" })).toHaveClass("m-hdr-back--icon");
    expect(screen.getByRole("link", { name: "뒤로" }).querySelector(".rm-brand-mark")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "호스트 화면" })).not.toBeInTheDocument();
  });

  it("renders member session mobile chrome with a brand mark back link", () => {
    renderAt("/app/session/current", <MobileHeader variant="member" />);

    expect(screen.getByText("이번 세션")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "뒤로" })).toHaveAttribute("href", "/app");
    expect(screen.getByRole("link", { name: "뒤로" }).textContent).toBe("");
    expect(screen.getByRole("link", { name: "뒤로" })).toHaveClass("m-hdr-back--icon");
    expect(screen.getByRole("link", { name: "뒤로" }).querySelector(".rm-brand-mark")).toBeInTheDocument();
  });

  it("shows a compact mobile host workspace entry from member screens when requested", () => {
    renderAt("/app", <MobileHeader variant="member" showHostEntry />);

    expect(screen.getByText("읽는사이")).toBeInTheDocument();
    const hostEntry = screen.getByRole("link", { name: "호스트 화면" });
    expect(hostEntry).toHaveAttribute("href", "/app/host");
    expect(hostEntry).toHaveClass("m-hdr-link--icon");
    expect(hostEntry.textContent).toBe("");
  });

  it("renders host editor pages with a host back link", () => {
    renderAt("/app/host/sessions/session-6/edit", <MobileHeader variant="host" />);

    expect(screen.getByText("세션")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "뒤로" })).toHaveAttribute("href", "/app/host");
    const memberReturn = screen.getByRole("link", { name: "멤버 화면으로" });
    expect(memberReturn).toHaveAttribute("href", "/app");
    expect(memberReturn).toHaveClass("m-hdr-link--icon");
    expect(memberReturn.textContent).toBe("");
  });

  it("renders the host new session route as the session editor title", () => {
    renderAt("/app/host/sessions/new", <MobileHeader variant="host" />);

    expect(screen.getByText("세션")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "뒤로" })).toHaveAttribute("href", "/app/host");
    const memberReturn = screen.getByRole("link", { name: "멤버 화면으로" });
    expect(memberReturn).toHaveAttribute("href", "/app");
    expect(memberReturn).toHaveClass("m-hdr-link--icon");
    expect(memberReturn.textContent).toBe("");
  });

  it("keeps host record routes in host mobile chrome with member return", () => {
    renderAt("/app/archive", <MobileHeader variant="host" />);

    expect(screen.getByText("기록")).toBeInTheDocument();
    const memberReturn = screen.getByRole("link", { name: "멤버 화면으로" });
    expect(memberReturn).toHaveAttribute("href", "/app");
    expect(memberReturn).toHaveClass("m-hdr-link--icon");
    expect(memberReturn.textContent).toBe("");
    expect(screen.queryByRole("link", { name: "뒤로" })).not.toBeInTheDocument();
  });

  it("keeps scoped mobile tabs inside the scoped app route", () => {
    renderAt(
      "/clubs/reading-sai/app/archive",
      <MobileTabBar variant="host" currentSessionId="session-6" appBasePath="/clubs/reading-sai/app" />,
    );

    const tabs = screen.getByRole("navigation", { name: "앱 탭" });
    expect(within(tabs).getByRole("link", { name: "홈" })).toHaveAttribute("href", "/clubs/reading-sai/app/host");
    expect(within(tabs).getByRole("link", { name: "세션" })).toHaveAttribute(
      "href",
      "/clubs/reading-sai/app/host/sessions/session-6/edit",
    );
    expect(within(tabs).getByRole("link", { name: "아카이브" })).toHaveAttribute("href", "/clubs/reading-sai/app/archive");
    expect(within(tabs).getByRole("link", { name: "아카이브" })).toHaveAttribute("aria-current", "page");
  });

  it("renders the host notifications route as an alert page on mobile", () => {
    renderAt("/app/host/notifications", <MobileHeader variant="host" />);

    expect(screen.getByText("알림")).toBeInTheDocument();
    expect(screen.queryByText("오늘")).not.toBeInTheDocument();
  });

  it("uses stable mobile feedback titles and source-aware back links", () => {
    render(
      <MemoryRouter
        initialEntries={[
          {
            pathname: "/app/feedback/session-6",
            state: {
              readmatesReturnTo: "/app/me",
              readmatesReturnLabel: "내 공간으로 돌아가기",
            },
          },
        ]}
      >
        <MobileHeader variant="member" />
      </MemoryRouter>,
    );

    expect(screen.getByText("피드백 문서")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "뒤로" })).toHaveAttribute("href", "/app/me");
    expect(screen.getByRole("link", { name: "뒤로" })).toHaveTextContent("뒤로");

    cleanup();
    render(
      <MemoryRouter
        initialEntries={[
          {
            pathname: "/app/feedback/session-6",
            state: {
              readmatesReturnTo: "/app/sessions/session-6#mobile-feedback",
              readmatesReturnLabel: "세션으로 돌아가기",
              readmatesReturnState: {
                readmatesReturnTo: "/app/archive?view=sessions",
                readmatesReturnLabel: "아카이브로",
              },
            },
          },
        ]}
      >
        <MobileHeader variant="member" />
      </MemoryRouter>,
    );

    expect(screen.getByRole("link", { name: "뒤로" })).toHaveAttribute("href", "/app/sessions/session-6#mobile-feedback");
    expect(screen.getByRole("link", { name: "뒤로" })).toHaveTextContent("뒤로");
    expect(screen.queryByText("세션으로 돌아가기")).not.toBeInTheDocument();

    cleanup();
    renderAt("/app/feedback/session-6", <MobileHeader variant="member" />);

    expect(screen.getByText("피드백 문서")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "뒤로" })).toHaveAttribute("href", "/app/archive?view=report");
  });

  it("returns feedback print mobile routes to the document before the source list", () => {
    render(
      <MemoryRouter
        initialEntries={[
          {
            pathname: "/app/feedback/session-6/print",
            state: {
              readmatesReturnTo: "/app/archive?view=report",
              readmatesReturnLabel: "아카이브로 돌아가기",
            },
          },
        ]}
      >
        <MobileHeader variant="member" />
      </MemoryRouter>,
    );

    expect(screen.getByText("피드백 문서")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "뒤로" })).toHaveAttribute("href", "/app/feedback/session-6");
  });

  it("preserves archive search params for mobile session detail back links", () => {
    render(
      <MemoryRouter
        initialEntries={[
          {
            pathname: "/app/sessions/session-6",
            state: {
              readmatesReturnTo: "/app/archive?view=questions",
              readmatesReturnLabel: "아카이브로",
            },
          },
        ]}
      >
        <MobileHeader variant="member" />
      </MemoryRouter>,
    );

    expect(screen.getByText("지난 세션")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "뒤로" })).toHaveAttribute("href", "/app/archive?view=questions");
    expect(screen.getByRole("link", { name: "뒤로" })).toHaveTextContent("뒤로");

    cleanup();
    renderAt("/app/sessions/session-6", <MobileHeader variant="member" />);

    expect(screen.getByRole("link", { name: "뒤로" })).toHaveAttribute("href", "/app/archive?view=sessions");
    expect(screen.getByRole("link", { name: "뒤로" })).toHaveTextContent("뒤로");
  });
});

describe("MobileTabBar app tabs", () => {
  it("renders member mobile tabs with archive active", () => {
    renderAt("/app/archive", <MobileTabBar variant="member" />);

    const tabs = screen.getByRole("navigation", { name: "앱 탭" });
    expect(within(tabs).getAllByRole("link").map((tab) => tab.textContent)).toEqual([
      "홈",
      "이번 세션",
      "클럽 노트",
      "아카이브",
      "알림",
      "내 공간",
    ]);
    expect(within(tabs).getByRole("link", { name: "홈" })).toHaveAttribute("href", "/app");
    expect(within(tabs).getByRole("link", { name: "이번 세션" })).toHaveAttribute("href", "/app/session/current");
    expect(within(tabs).getByRole("link", { name: "클럽 노트" })).toHaveAttribute("href", "/app/notes");
    expect(within(tabs).getByRole("link", { name: "아카이브" })).toHaveAttribute("href", "/app/archive");
    expect(within(tabs).getByRole("link", { name: "알림" })).toHaveAttribute("href", "/app/notifications");
    expect(within(tabs).getByRole("link", { name: "내 공간" })).toHaveAttribute("href", "/app/me");
    expect(within(tabs).getByRole("link", { name: "아카이브" })).toHaveAttribute("aria-current", "page");
    expect(within(tabs).queryByRole("link", { name: "운영" })).not.toBeInTheDocument();
  });

  it("marks the member notification tab active on notification routes", () => {
    renderAt("/app/notifications", <MobileTabBar variant="member" />);

    const tabs = screen.getByRole("navigation", { name: "앱 탭" });
    expect(within(tabs).getByRole("link", { name: "알림" })).toHaveAttribute("aria-current", "page");
    expect(within(tabs).getByRole("link", { name: "아카이브" })).not.toHaveAttribute("aria-current");
  });

  it("keeps the archive tab active on member session detail routes", () => {
    renderAt("/app/sessions/session-6", <MobileTabBar variant="member" />);

    const tabs = screen.getByRole("navigation", { name: "앱 탭" });
    expect(within(tabs).getByRole("link", { name: "아카이브" })).toHaveAttribute("aria-current", "page");
    expect(within(tabs).getByRole("link", { name: "이번 세션" })).not.toHaveAttribute("aria-current");
  });

  it("keeps the archive tab active on member feedback document routes", () => {
    renderAt("/app/feedback/session-6", <MobileTabBar variant="member" />);

    const tabs = screen.getByRole("navigation", { name: "앱 탭" });
    expect(within(tabs).getByRole("link", { name: "아카이브" })).toHaveAttribute("aria-current", "page");
    expect(within(tabs).getByRole("link", { name: "이번 세션" })).not.toHaveAttribute("aria-current");
  });

  it("renders host mobile tabs with edit active for host session routes", () => {
    renderAt("/app/host/sessions/new", <MobileTabBar variant="host" currentSessionId="session-6" />);

    const tabs = screen.getByRole("navigation", { name: "앱 탭" });
    expect(within(tabs).getAllByRole("link").map((tab) => tab.textContent)).toEqual([
      "홈",
      "세션",
      "알림",
      "멤버",
      "아카이브",
    ]);
    expect(within(tabs).getByRole("link", { name: "홈" })).toHaveAttribute("href", "/app/host");
    expect(within(tabs).getByRole("link", { name: "세션" })).toHaveAttribute(
      "href",
      "/app/host/sessions/session-6/edit",
    );
    expect(within(tabs).getByRole("link", { name: "알림" })).toHaveAttribute("href", "/app/host/notifications");
    expect(within(tabs).getByRole("link", { name: "멤버" })).toHaveAttribute("href", "/app/host/members");
    expect(within(tabs).getByRole("link", { name: "아카이브" })).toHaveAttribute("href", "/app/archive");
    expect(within(tabs).getByRole("link", { name: "세션" })).toHaveAttribute("aria-current", "page");
    expect(within(tabs).queryByRole("link", { name: "이번 세션" })).not.toBeInTheDocument();
    expect(within(tabs).queryByRole("link", { name: "내 공간" })).not.toBeInTheDocument();
    expect(within(tabs).getAllByRole("link").map((tab) => tab.getAttribute("href"))).not.toContain(
      "/app/session/current",
    );
  });

  it("marks host edit active on existing session edit routes", () => {
    renderAt("/app/host/sessions/session-6/edit", <MobileTabBar variant="host" currentSessionId="session-6" />);

    const tabs = screen.getByRole("navigation", { name: "앱 탭" });
    expect(within(tabs).getByRole("link", { name: "홈" })).not.toHaveAttribute("aria-current");
    expect(within(tabs).getByRole("link", { name: "세션" })).toHaveAttribute("aria-current", "page");
  });

  it("marks the host member tab active on invitation and member routes", () => {
    renderAt("/app/host/invitations", <MobileTabBar variant="host" currentSessionId={null} />);

    const tabs = screen.getByRole("navigation", { name: "앱 탭" });
    expect(within(tabs).getByRole("link", { name: "멤버" })).toHaveAttribute("href", "/app/host/members");
    expect(within(tabs).getByRole("link", { name: "멤버" })).toHaveAttribute("aria-current", "page");

    cleanup();
    renderAt("/app/host/members", <MobileTabBar variant="host" currentSessionId={null} />);

    const approvalTabs = screen.getByRole("navigation", { name: "앱 탭" });
    expect(within(approvalTabs).getByRole("link", { name: "멤버" })).toHaveAttribute("aria-current", "page");
  });

  it("marks the host notifications tab active on the notifications route", () => {
    renderAt("/app/host/notifications", <MobileTabBar variant="host" currentSessionId={null} />);

    const tabs = screen.getByRole("navigation", { name: "앱 탭" });
    expect(within(tabs).getByRole("link", { name: "알림" })).toHaveAttribute("href", "/app/host/notifications");
    expect(within(tabs).getByRole("link", { name: "알림" })).toHaveAttribute("aria-current", "page");
    expect(within(tabs).getByRole("link", { name: "홈" })).not.toHaveAttribute("aria-current");
  });

  it("marks host records active on archive routes", () => {
    renderAt("/app/archive", <MobileTabBar variant="host" currentSessionId="session-6" />);

    const tabs = screen.getByRole("navigation", { name: "앱 탭" });
    expect(within(tabs).getByRole("link", { name: "아카이브" })).toHaveAttribute("href", "/app/archive");
    expect(within(tabs).getByRole("link", { name: "아카이브" })).toHaveAttribute("aria-current", "page");
    expect(within(tabs).getByRole("link", { name: "홈" })).not.toHaveAttribute("aria-current");
  });

  it("marks host records active on feedback document routes", () => {
    renderAt("/app/feedback/session-6", <MobileTabBar variant="host" currentSessionId="session-6" />);

    const tabs = screen.getByRole("navigation", { name: "앱 탭" });
    expect(within(tabs).getByRole("link", { name: "아카이브" })).toHaveAttribute("aria-current", "page");
    expect(within(tabs).getByRole("link", { name: "홈" })).not.toHaveAttribute("aria-current");
  });

  it("disables host edit while the current session lookup is loading", () => {
    renderAt("/app/host", <MobileTabBar variant="host" currentSessionId={undefined} />);

    const tabs = screen.getByRole("navigation", { name: "앱 탭" });
    expect(within(tabs).queryByRole("link", { name: "세션" })).not.toBeInTheDocument();
    expect(within(tabs).getByLabelText("세션 불러오는 중")).toHaveAttribute("aria-disabled", "true");
    expect(within(tabs).getByText("확인 중")).toBeInTheDocument();
    expect(within(tabs).getByRole("link", { name: "홈" })).toHaveAttribute("aria-current", "page");
  });

  it("marks the pending host edit tab current on host editor routes", () => {
    renderAt("/app/host/sessions/session-6/edit", <MobileTabBar variant="host" currentSessionId={undefined} />);

    const tabs = screen.getByRole("navigation", { name: "앱 탭" });
    expect(within(tabs).queryByRole("link", { name: "세션" })).not.toBeInTheDocument();
    expect(within(tabs).getByLabelText("세션 불러오는 중")).toHaveAttribute("aria-disabled", "true");
    expect(within(tabs).getByLabelText("세션 불러오는 중")).toHaveAttribute("aria-current", "page");
    expect(within(tabs).getByRole("link", { name: "홈" })).not.toHaveAttribute("aria-current");
  });

  it("links host edit to new session when there is no current session", () => {
    renderAt("/app/host", <MobileTabBar variant="host" currentSessionId={null} />);

    const tabs = screen.getByRole("navigation", { name: "앱 탭" });
    expect(within(tabs).getByRole("link", { name: "홈" })).toHaveAttribute("aria-current", "page");
    expect(within(tabs).getByRole("link", { name: "세션" })).toHaveAttribute("href", "/app/host/sessions/new");
  });
});
