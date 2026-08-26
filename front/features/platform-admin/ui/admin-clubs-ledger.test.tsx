import { readFileSync } from "node:fs";
import path from "node:path";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it, vi } from "vitest";
import { findUnnamedInteractiveElements } from "@/shared/testing/accessibility-checks";
import {
  AdminClubsLedger,
  type AdminClubsLedgerClub,
} from "./admin-clubs-ledger";

const LEDGER_CSS = readFileSync(
  path.resolve("features/platform-admin/ui/admin-editorial-ledger.css"),
  "utf8",
);

const club: AdminClubsLedgerClub = {
  clubId: "c-1",
  slug: "alpha",
  name: "Alpha",
  status: "ACTIVE",
  publicVisibility: "PRIVATE",
  domainCount: 1,
  domainActionRequiredCount: 0,
  firstHostOnboardingState: "ASSIGNED",
  href: "/admin/clubs/c-1?returnTo=%2Fadmin%2Fclubs%3Fsearch%3Dalpha&focusId=c-1&scrollTop=240",
  severity: "ok",
  reasons: [],
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

    expect(screen.getByRole("heading", { name: "클럽" })).toBeInTheDocument();
    expect(screen.getByText("Club registry")).toBeInTheDocument();
    expect(
      screen.getByRole("searchbox", { name: "클럽 검색" }),
    ).toHaveValue("alpha");
    expect(screen.getByRole("link", { name: "새 클럽" })).toHaveAttribute(
      "href",
      "/admin/clubs?search=alpha&onboarding=1",
    );
    expect(screen.getByRole("link", { name: "Alpha" })).toHaveAttribute(
      "href",
      club.href,
    );
    expect(screen.getByRole("region", { name: "클럽 레지스트리" })).toBeInTheDocument();
    expect(findUnnamedInteractiveElements(container)).toEqual([]);
  });

  it("restores row focus and bounded scroll after returning from detail", async () => {
    const { container } = renderLedger({ focusId: "c-1", scrollTop: 240 });
    const scroller = container.querySelector(
      ".admin-clubs-ledger__scroller",
    ) as HTMLElement;

    await waitFor(() =>
      expect(screen.getByRole("link", { name: "Alpha" })).toHaveFocus(),
    );
    expect(scroller.scrollTop).toBe(240);
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
    expect(LEDGER_CSS).toMatch(
      /\.admin-clubs-ledger[\s\S]*min-height:\s*44px/,
    );
    expect(LEDGER_CSS).toContain(".admin-clubs-ledger");
    expect(LEDGER_CSS).toContain("prefers-reduced-motion");
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
