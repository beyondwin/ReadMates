import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { createEvent, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it, vi } from "vitest";
import { findUnnamedInteractiveElements } from "@/shared/testing/accessibility-checks";
import {
  AdminClubsLedger,
  type AdminClubsLedgerClub,
} from "./admin-clubs-ledger";

const CLUB_MANAGEMENT_CSS_PATH = path.resolve(
  "features/platform-admin/ui/admin-club-management.css",
);
const CLUB_MANAGEMENT_CSS =
  existsSync(CLUB_MANAGEMENT_CSS_PATH)
    ? readFileSync(CLUB_MANAGEMENT_CSS_PATH, "utf8")
    : "";

const club: AdminClubsLedgerClub = {
  clubId: "c-1",
  name: "Alpha",
  href: "/admin/clubs/c-1?returnTo=%2Fadmin%2Fclubs%3Fsearch%3Dalpha&focusId=c-1&scrollTop=240",
  currentState: "활성 · 비공개",
  requiredAction: null,
  recentSignal: null,
  emphasis: "quiet",
  technicalDisclosure: [
    { label: "클럽 ID", value: "c-1" },
    { label: "Slug", value: "alpha" },
    { label: "수명주기 값", value: "ACTIVE" },
    { label: "공개 상태 값", value: "PRIVATE" },
  ],
};

function renderLedger(
  overrides: Partial<Parameters<typeof AdminClubsLedger>[0]> = {},
) {
  return render(
    <MemoryRouter>
      <AdminClubsLedger
        clubs={[club]}
        filters={{ search: "alpha" }}
        searchDraft="alpha"
        pageState="ready"
        canCreateClub
        onboardingHref="/admin/clubs?search=alpha&onboarding=1"
        focusId={null}
        scrollTop={0}
        hasNextPage={false}
        loadingMore={false}
        onSearchChange={vi.fn()}
        onFilterChange={vi.fn()}
        onRetry={vi.fn()}
        onLoadMore={vi.fn()}
        onScrollChange={vi.fn()}
        {...overrides}
      />
    </MemoryRouter>,
  );
}

describe("AdminClubsLedger", () => {
  it("composes page context, work-view filters, and an evidence ledger", () => {
    const { container } = renderLedger();

    expect(screen.getByRole("heading", { name: "클럽 찾기" })).toBeInTheDocument();
    expect(screen.queryByText("Club registry")).toBeNull();
    expect(screen.getByRole("tab", { name: /전체/ })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "선택한 클럽" })).toBeInTheDocument();
    expect(
      screen.getByRole("searchbox", { name: "클럽 검색", hidden: true }),
    ).toHaveValue("alpha");
    expect(screen.getByRole("link", { name: "새 클럽" })).toHaveAttribute(
      "href",
      "/admin/clubs?search=alpha&onboarding=1",
    );
    expect(screen.getByRole("link", { name: "Alpha" })).toHaveAttribute(
      "href",
      club.href,
    );
    expect(screen.getByRole("region", { name: "클럽 관리 목록" })).toBeInTheDocument();
    const row = container.querySelector(
      '[data-club-id="c-1"]',
    ) as HTMLElement;
    expect(within(row).getByText("활성 · 비공개")).toBeInTheDocument();
    expect(row).toHaveAttribute("data-emphasis", "quiet");
    expect(within(row).queryByText("필요한 조치")).toBeNull();
    expect(within(row).queryByText("마지막 확인")).toBeNull();
    expect(within(row).getByRole("group", { name: "기술 정보" })).toBeInTheDocument();
    expect(within(row).getByText("alpha")).toBeInTheDocument();
    expect(within(row).getByText("ACTIVE")).toBeInTheDocument();
    expect(within(row).getByText("PRIVATE")).toBeInTheDocument();
    expect(findUnnamedInteractiveElements(container)).toEqual([]);
  });

  it("passes the real page state and omits count while loading or unavailable", () => {
    const { rerender } = render(
      <MemoryRouter>
        <AdminClubsLedger
          clubs={[club]}
          filters={{}}
          searchDraft=""
          pageState="loading"
          canCreateClub={false}
          onboardingHref="/admin/clubs"
          focusId={null}
          scrollTop={0}
          hasNextPage={false}
          loadingMore={false}
          onSearchChange={vi.fn()}
          onFilterChange={vi.fn()}
          onRetry={vi.fn()}
          onLoadMore={vi.fn()}
          onScrollChange={vi.fn()}
        />
      </MemoryRouter>,
    );
    expect(screen.getByText("클럽을 불러오는 중입니다.")).toBeInTheDocument();
    expect(screen.queryByText("1건")).not.toBeInTheDocument();

    rerender(
      <MemoryRouter>
        <AdminClubsLedger
          clubs={[club]}
          filters={{}}
          searchDraft=""
          pageState="unavailable"
          canCreateClub={false}
          onboardingHref="/admin/clubs"
          focusId={null}
          scrollTop={0}
          hasNextPage={false}
          loadingMore={false}
          onSearchChange={vi.fn()}
          onFilterChange={vi.fn()}
          onRetry={vi.fn()}
          onLoadMore={vi.fn()}
          onScrollChange={vi.fn()}
        />
      </MemoryRouter>,
    );
    expect(
      screen.getByText("클럽 목록을 불러오지 못했습니다."),
    ).toBeInTheDocument();
    expect(screen.queryByText("1건")).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Alpha" })).not.toBeInTheDocument();
  });

  it("restores row focus and bounded scroll after returning from detail", async () => {
    const { container } = renderLedger({ focusId: "c-1", scrollTop: 240 });
    const scroller = container.querySelector(
      ".admin-clubs-ledger__scroller",
    ) as HTMLElement;

    await waitFor(() =>
      expect(container.querySelector(".admin-club-management__row")).toHaveFocus(),
    );
    expect(scroller.scrollTop).toBe(240);
  });

  it("consumes restore once the target exists and does not re-yank on later updates", async () => {
    const later: AdminClubsLedgerClub = {
      ...club,
      clubId: "c-2",
      slug: "beta",
      name: "Beta",
      href: "/admin/clubs/c-2",
    };
    const { container, rerender } = render(
      <MemoryRouter>
        <AdminClubsLedger
          clubs={[club]}
          filters={{ search: "alpha" }}
          searchDraft="alpha"
          pageState="ready"
          canCreateClub
          onboardingHref="/admin/clubs?search=alpha&onboarding=1"
          restoreKey="return-1"
          focusId="c-1"
          scrollTop={240}
          hasNextPage={false}
          loadingMore={false}
          onSearchChange={vi.fn()}
          onFilterChange={vi.fn()}
          onRetry={vi.fn()}
          onLoadMore={vi.fn()}
          onScrollChange={vi.fn()}
        />
      </MemoryRouter>,
    );
    const scroller = container.querySelector(
      ".admin-clubs-ledger__scroller",
    ) as HTMLElement;
    await waitFor(() =>
      expect(container.querySelector(".admin-club-management__row")).toHaveFocus(),
    );
    expect(scroller.scrollTop).toBe(240);

    const filters = container.querySelector("details.admin-club-management__filters");
    filters?.setAttribute("open", "");
    screen.getByRole("searchbox", { name: "클럽 검색" }).focus();
    scroller.scrollTop = 12;

    rerender(
      <MemoryRouter>
        <AdminClubsLedger
          clubs={[club, later]}
          filters={{ search: "alpha" }}
          searchDraft="alpha"
          pageState="ready"
          canCreateClub
          onboardingHref="/admin/clubs?search=alpha&onboarding=1"
          restoreKey="return-1"
          focusId="c-1"
          scrollTop={240}
          hasNextPage
          loadingMore={false}
          onSearchChange={vi.fn()}
          onFilterChange={vi.fn()}
          onRetry={vi.fn()}
          onLoadMore={vi.fn()}
          onScrollChange={vi.fn()}
        />
      </MemoryRouter>,
    );

    expect(screen.getByRole("searchbox", { name: "클럽 검색" })).toHaveFocus();
    expect(scroller.scrollTop).toBe(12);
    expect(container.querySelector(".admin-club-management__row")).not.toHaveFocus();
  });

  it("rejects unsafe focus ids and unbounded scroll offsets", async () => {
    const { container } = renderLedger({
      focusId: "../evil",
      scrollTop: 1_000_001,
    });
    const scroller = container.querySelector(
      ".admin-clubs-ledger__scroller",
    ) as HTMLElement;

    await waitFor(() =>
      expect(screen.getByRole("link", { name: "Alpha" })).not.toHaveFocus(),
    );
    expect(document.activeElement).not.toBe(
      screen.getByRole("link", { name: "Alpha" }),
    );
    expect(scroller.scrollTop).toBe(0);
  });

  it("reports scroller offsets so the route can encode them on detail links", () => {
    const onScrollChange = vi.fn();
    const { container } = renderLedger({ onScrollChange });
    const scroller = container.querySelector(
      ".admin-clubs-ledger__scroller",
    ) as HTMLElement;
    Object.defineProperty(scroller, "scrollTop", {
      configurable: true,
      value: 240,
    });

    fireEvent.scroll(scroller);
    expect(onScrollChange).toHaveBeenCalledWith(240);
  });

  it("hides the new-club action without CREATE_CLUB", () => {
    renderLedger({ canCreateClub: false });
    expect(
      screen.queryByRole("link", { name: "새 클럽" }),
    ).not.toBeInTheDocument();
  });

  it("locks 44px targets and reduced motion in the scoped clubs ledger stylesheet", () => {
    expect(existsSync(CLUB_MANAGEMENT_CSS_PATH)).toBe(true);
    expect(CLUB_MANAGEMENT_CSS).toMatch(
      /\.admin-club-management[\s\S]*min-height:\s*44px/,
    );
    expect(CLUB_MANAGEMENT_CSS).toContain(".admin-club-management");
    expect(CLUB_MANAGEMENT_CSS).toContain("prefers-reduced-motion");
  });

  it("paints club rows at the approved 17/600/23.8 title metric", () => {
    expect(CLUB_MANAGEMENT_CSS).toMatch(
      /\.admin-club-management__row[\s\S]*font-size:\s*17px[\s\S]*font-weight:\s*600[\s\S]*line-height:\s*23\.8px/,
    );
  });

  it("fills the approved page-heading band with the clubs h1", () => {
    expect(CLUB_MANAGEMENT_CSS).toMatch(
      /\.admin-clubs-ledger \.admin-page-frame > \.admin-page-frame__header h1[\s\S]*width:\s*100%[\s\S]*height:\s*68px/,
    );
  });

  it("exposes one tab stop per club row and reactivates from restored focus", async () => {
    const onActivateClub = vi.fn();
    const { container } = renderLedger({ focusId: "c-1", onActivateClub });
    const row = container.querySelector(".admin-club-management__row") as HTMLElement;
    const nameLink = screen.getByRole("link", { name: "Alpha" });

    expect(row).toHaveAttribute("tabIndex", "0");
    expect(nameLink).toHaveAttribute("tabIndex", "-1");
    await waitFor(() => expect(row).toHaveFocus());

    fireEvent.keyDown(row, { key: "Enter" });
    expect(onActivateClub).toHaveBeenCalledWith("c-1");
  });

  it.each([
    ["meta", { metaKey: true }],
    ["ctrl", { ctrlKey: true }],
    ["shift", { shiftKey: true }],
    ["alt", { altKey: true }],
    ["middle", { button: 1 }],
  ] as const)("lets %s-click use native name-link navigation", (_label, init) => {
    const onActivateClub = vi.fn();
    renderLedger({
      onActivateClub,
      clubs: [{ ...club, href: "#native-nav" }],
    });
    const nameLink = screen.getByRole("link", { name: "Alpha" });
    const event = createEvent.click(nameLink, init);
    fireEvent(nameLink, event);
    expect(event.defaultPrevented).toBe(false);
    expect(onActivateClub).not.toHaveBeenCalled();
  });

  it("lets a keyboard operator focus a club row", () => {
    const { container } = renderLedger();
    expect(container.querySelector(".admin-club-management__row")).toHaveAttribute("tabIndex", "0");
  });

  it("does not let collapsed space-control intercept club rows", () => {
    const shellCss = readFileSync(
      path.resolve("features/platform-admin/ui/admin-shell.css"),
      "utf8",
    );
    expect(CLUB_MANAGEMENT_CSS).not.toContain(".admin-shell:has(");
    expect(shellCss).toMatch(
      /\.admin-shell__space-control:not\(:has\(\.rm-global-space-switcher__trigger\[aria-expanded="true"\]\)\)[\s\S]*pointer-events:\s*none/,
    );
  });

  it("emphasizes only rows that need an operator decision", () => {
    const actionable: AdminClubsLedgerClub = {
      ...club,
      requiredAction: "실패 신호 확인",
      recentSignal: "알림 실패 2건",
      emphasis: "actionable",
    };
    const { container } = renderLedger({ clubs: [actionable] });
    const row = container.querySelector('[data-club-id="c-1"]') as HTMLElement;

    expect(row).toHaveAttribute("data-emphasis", "actionable");
    expect(within(row).getByText("필요한 조치")).toBeInTheDocument();
    expect(within(row).getByText("실패 신호 확인")).toBeInTheDocument();
    expect(within(row).getByText("최근 신호")).toBeInTheDocument();
    expect(within(row).getByText("알림 실패 2건")).toBeInTheDocument();
  });

  it("does not import route, query, or API modules", () => {
    const source = readFileSync(
      path.resolve("features/platform-admin/ui/admin-clubs-ledger.tsx"),
      "utf8",
    );
    expect(source).not.toContain("platform-admin-queries");
    expect(source).not.toContain("platform-admin-api");
    expect(source).not.toContain("admin-clubs-route");
    expect(/fetch\s*\(/.test(source)).toBe(false);
  });
});
