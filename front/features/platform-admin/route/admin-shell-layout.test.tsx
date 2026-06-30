import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  PlatformAdminClubListResponse,
  PlatformAdminSummaryResponse,
} from "@/features/platform-admin/model/platform-admin-domain-types";
import type { AuthMeResponse } from "@/shared/auth/auth-contracts";
import {
  platformAdminClubsQuery,
  platformAdminSummaryQuery,
} from "@/features/platform-admin/queries/platform-admin-queries";
import { findUnnamedInteractiveElements } from "@/shared/testing/accessibility-checks";

vi.mock("@/features/auth/api/auth-api", () => ({
  logout: vi.fn(),
}));

import { logout } from "@/features/auth/api/auth-api";
import { AdminShellLayout } from "./admin-shell-layout";

const summary: PlatformAdminSummaryResponse = {
  platformRole: "OWNER",
  activeClubCount: 1,
  domainActionRequiredCount: 0,
  domainsRequiringAction: [],
};

const clubs: PlatformAdminClubListResponse = { items: [] };

const auth = {
  authenticated: true,
  userId: "platform-owner-user",
  membershipId: null,
  clubId: null,
  email: "owner@example.com",
  displayName: "OWNER admin",
  accountName: "OWNER admin",
  role: null,
  membershipStatus: null,
  approvalState: "INACTIVE",
  currentMembership: null,
  joinedClubs: [
    {
      clubId: "club-reading-sai",
      clubSlug: "reading-sai",
      clubName: "읽는사이",
      membershipId: "membership-host",
      role: "HOST",
      status: "ACTIVE",
      primaryHost: null,
    },
  ],
  platformAdmin: { userId: "platform-owner-user", email: "owner@example.com", role: "OWNER" },
  recommendedAppEntryUrl: "/admin",
} satisfies AuthMeResponse;

function renderShell(initialEntry: string, opts: { auth?: typeof auth | null } = {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  queryClient.setQueryData(platformAdminSummaryQuery().queryKey, summary);
  queryClient.setQueryData(platformAdminClubsQuery().queryKey, clubs);
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <Routes>
          <Route path="/admin/*" element={<AdminShellLayout auth={opts.auth ?? auth} />}>
            <Route path="today" element={<div>today content</div>} />
            <Route path="clubs" element={<div>clubs content</div>} />
          </Route>
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
);
}

describe("AdminShellLayout", () => {
  beforeEach(() => {
    vi.mocked(logout).mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders status strip, leftnav, and breadcrumb", () => {
    renderShell("/admin/today");
    expect(screen.getAllByText("OWNER").length).toBeGreaterThan(0);
    expect(screen.getByText("오늘/헬스")).toBeInTheDocument();
    expect(screen.getByText("today content")).toBeInTheDocument();
  });

  it("renders the new-club button for OWNER role", () => {
    renderShell("/admin/today");
    expect(screen.getByRole("link", { name: /새 클럽/ })).toBeInTheDocument();
  });

  it("shows the onboarding modal when ?onboarding=1 is present", () => {
    renderShell("/admin/today?onboarding=1");
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("does not show the onboarding modal without the query param", () => {
    renderShell("/admin/today");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("exposes navigation and main landmarks with a skip link to main content", () => {
    const { container } = renderShell("/admin/today");
    expect(screen.getByRole("navigation", { name: "Admin 콘솔" })).toBeInTheDocument();
    expect(screen.getAllByRole("navigation").map((nav) => nav.getAttribute("aria-label"))).toEqual([
      "현재 위치",
      "Admin 콘솔",
    ]);
    const main = screen.getByRole("main");
    expect(main).toHaveAttribute("id", "admin-main");
    expect(main).toHaveAttribute("tabindex", "-1");
    const skipLink = screen.getByRole("link", { name: "본문으로 건너뛰기" });
    expect(skipLink).toHaveAttribute("href", "#admin-main");
    fireEvent.click(skipLink);
    expect(main).toHaveFocus();
    expect(findUnnamedInteractiveElements(container)).toEqual([]);
  });

  it("replaces the member-space link with current-account workspace destinations", () => {
    renderShell("/admin/today");

    expect(screen.queryByRole("link", { name: /멤버 공간/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "내 공간" }));

    expect(screen.getByRole("link", { name: "읽는사이 호스트 공간" })).toHaveAttribute(
      "href",
      "/clubs/reading-sai/app/host",
    );
    expect(screen.getByRole("link", { name: "읽는사이 멤버 공간" })).toHaveAttribute(
      "href",
      "/clubs/reading-sai/app",
    );
  });

  it("sends other-account login through logout and a safe admin return path", async () => {
    vi.mocked(logout).mockResolvedValue(new Response(null, { status: 204 }));
    const assign = vi.fn();
    vi.stubGlobal("location", { assign });

    renderShell("/admin/clubs?filter=ready#top");
    fireEvent.click(screen.getByRole("button", { name: "내 공간" }));
    fireEvent.click(screen.getByRole("button", { name: "다른 계정으로 로그인" }));

    await waitFor(() => {
      expect(logout).toHaveBeenCalledTimes(1);
      expect(assign).toHaveBeenCalledWith("/login?returnTo=%2Fadmin%2Fclubs%3Ffilter%3Dready%23top");
    });
  });
});
