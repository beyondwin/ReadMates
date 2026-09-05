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

const sentencesClub: AdminClubsLedgerClub = {
  clubId: "club-sentences",
  name: "문장과 사람들",
  href: "/admin/clubs/club-sentences",
  currentState: "운영 중",
  requiredAction: "설정 확인 필요",
  recentSignal: "공개 범위 설정을 다시 확인해 주세요.",
  emphasis: "actionable",
  technicalDisclosure: [
    { label: "클럽 ID", value: "club-sentences" },
    { label: "Slug", value: "sentences" },
    { label: "수명주기 값", value: "ACTIVE" },
    { label: "공개 상태 값", value: "PRIVATE" },
  ],
  operationsFacts: {
    hostsLabel: "호스트 2명",
    membersLabel: "멤버 18명",
    recordsLabel: "공개 기록 6건",
    domainLabel: "도메인 정상",
    reviewLabel: "공개 범위 설정을 다시 확인해 주세요.",
    ageLabel: "10분 전",
  },
};

const routeShapedClub: AdminClubsLedgerClub = {
  clubId: "club-sample",
  name: "샘플 독서모임",
  href: "/admin/clubs/club-sample",
  currentState: "활성 · 공개",
  requiredAction: null,
  recentSignal: null,
  emphasis: "quiet",
  technicalDisclosure: [
    { label: "클럽 ID", value: "club-sample" },
    { label: "Slug", value: "sample-reading" },
    { label: "수명주기 값", value: "ACTIVE" },
    { label: "공개 상태 값", value: "PUBLIC" },
  ],
  facts: [
    { icon: "people", label: "호스트", value: "1명" },
    { icon: "link", label: "도메인", value: "연결됨" },
  ],
  operationsFacts: {
    hostsLabel: "호스트 1명",
    membersLabel: "",
    recordsLabel: "",
    domainLabel: "도메인 연결됨",
    reviewLabel: "활성 · 공개",
    ageLabel: "",
  },
};

const saturdayClub: AdminClubsLedgerClub = {
  clubId: "club-saturday",
  name: "토요일의 책",
  href: "/admin/clubs/club-saturday",
  currentState: "운영 중",
  requiredAction: "설정 확인 필요",
  recentSignal: "호스트 초대 대기",
  emphasis: "actionable",
  technicalDisclosure: [
    { label: "클럽 ID", value: "club-saturday" },
    { label: "Slug", value: "saturday-book" },
    { label: "수명주기 값", value: "ACTIVE" },
    { label: "공개 상태 값", value: "PUBLIC" },
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
  it("renders three counted tabs, a warn-marked selected row, icon facts, and a review section", () => {
    renderLedger({
      clubs: [sentencesClub, saturdayClub],
      filters: {},
      searchDraft: "",
      tabCounts: { all: 24, attention: 2, operating: 22 },
      canCreateClub: true,
    });
    expect(screen.getAllByRole("tab")).toHaveLength(3);
    expect(screen.getByRole("tab", { name: /확인 필요 2/ })).toBeTruthy();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("문장과 사람들");
    expect(screen.getByRole("list", { name: "운영 상태" }).querySelectorAll("[data-icon]")).toHaveLength(4);
    expect(screen.getByRole("heading", { name: "확인할 내용" })).toBeTruthy();
    expect(screen.queryByText("기술 정보", { selector: ".admin-clubs-ledger__row *" })).toBeNull();
    const selectedRow = document.querySelector(
      '.admin-clubs-ledger__row[data-selected="true"]',
    ) as HTMLElement;
    expect(selectedRow).toBeTruthy();
    expect(selectedRow).not.toHaveAttribute("aria-selected");
  });

  it("keeps four fact icons and does not echo empty member or record labels as values", () => {
    renderLedger({
      clubs: [routeShapedClub],
      filters: {},
      searchDraft: "",
    });
    const facts = screen.getByRole("list", { name: "운영 상태" });
    expect(facts.querySelectorAll("[data-icon]")).toHaveLength(4);
    expect(facts.textContent ?? "").not.toMatch(/멤버\s*멤버/);
    expect(facts.textContent ?? "").not.toMatch(/공개 기록\s*공개 기록/);
    const member = facts.querySelector('[data-icon="person"]')?.closest("li");
    const records = facts.querySelector('[data-icon="document"]')?.closest("li");
    expect(member?.querySelector("span")).toHaveTextContent("멤버");
    expect(member?.querySelector("strong")).toHaveTextContent("—");
    expect(records?.querySelector("span")).toHaveTextContent("공개 기록");
    expect(records?.querySelector("strong")).toHaveTextContent("—");
  });

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
    expect(within(row).queryByRole("group", { name: "기술 정보" })).toBeNull();
    const detail = screen.getByRole("region", { name: "선택한 클럽" });
    expect(within(detail).getByRole("group", { name: "기술 정보" })).toBeInTheDocument();
    expect(within(detail).getByText("기술 정보 펼치기")).toBeInTheDocument();
    expect(within(detail).getByText("alpha")).toBeInTheDocument();
    expect(within(detail).getByText("ACTIVE")).toBeInTheDocument();
    expect(within(detail).getByText("PRIVATE")).toBeInTheDocument();
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
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("클럽 찾기");
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
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("클럽 찾기");
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
    expect(CLUB_MANAGEMENT_CSS).toMatch(
      /\.admin-club-management__filters:not\(\[open\]\)\s*>\s*summary[\s\S]*position:\s*absolute/,
    );
  });

  it("paints club rows at the approved 17/600/23.8 title metric", () => {
    expect(CLUB_MANAGEMENT_CSS).toMatch(
      /\.admin-club-management__row[\s\S]*font-size:\s*17px[\s\S]*font-weight:\s*600[\s\S]*line-height:\s*23\.8px/,
    );
  });

  it("fills the list heading at the approved 20/700 metric", () => {
    expect(CLUB_MANAGEMENT_CSS).toMatch(
      /\.admin-clubs-ledger__list h2[\s\S]*font-size:\s*20px[\s\S]*font-weight:\s*700/,
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
    expect(within(row).getByText("실패 신호 확인")).toBeInTheDocument();
    expect(row.querySelector('[data-icon="alert-circle"]')).toBeTruthy();
    expect(screen.getByRole("heading", { name: "확인할 내용" })).toBeInTheDocument();
    expect(screen.getByText("알림 실패 2건")).toBeInTheDocument();
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
