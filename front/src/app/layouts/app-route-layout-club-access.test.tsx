import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Link, MemoryRouter, Route, Routes } from "react-router";
import { AuthActionsContext, AuthContext } from "@/src/app/auth-state";
import type { AuthMeResponse } from "@/shared/auth/auth-contracts";
import { AppRouteLayout } from "./app-route-layout";

const memberAuth: AuthMeResponse = {
  authenticated: true,
  userId: "member-1",
  membershipId: "membership-1",
  clubId: "club-1",
  email: "member@example.com",
  displayName: "멤버",
  accountName: "Member",
  role: "MEMBER",
  membershipStatus: "ACTIVE",
  approvalState: "ACTIVE",
};

function ClubEpisodeProbe() {
  return (
    <main>
      <h1>클럽 콘텐츠</h1>
      <Link to="/clubs/reading-sai/app/notes">같은 클럽 기록</Link>
      <Link to="/clubs/sample-book-club/app">다른 클럽</Link>
    </main>
  );
}

function renderLayout() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <AuthActionsContext.Provider value={{ markLoggedOut: vi.fn(), refreshAuth: vi.fn() }}>
        <AuthContext.Provider value={{ status: "ready", auth: memberAuth }}>
          <MemoryRouter initialEntries={["/clubs/reading-sai/app"]}>
            <Routes>
              <Route
                path="/clubs/:clubSlug/app"
                element={<AppRouteLayout scopedAuth={memberAuth} audience="MEMBER" />}
              >
                <Route index element={<ClubEpisodeProbe />} />
                <Route path="*" element={<ClubEpisodeProbe />} />
              </Route>
            </Routes>
          </MemoryRouter>
        </AuthContext.Provider>
      </AuthActionsContext.Provider>
    </QueryClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("AppRouteLayout coarse club access", () => {
  it("touches once per club-scoped client episode across in-club navigation", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ lastClubAccessAt: "2026-08-29T01:02:03Z" }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    ));
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    renderLayout();
    await waitFor(() => expect(clubAccessCalls(fetchMock, "reading-sai")).toHaveLength(1));

    await user.click(screen.getByRole("link", { name: "같은 클럽 기록" }));
    expect(await screen.findByRole("heading", { name: "클럽 콘텐츠" })).toBeInTheDocument();
    expect(clubAccessCalls(fetchMock, "reading-sai")).toHaveLength(1);

    await user.click(screen.getByRole("link", { name: "다른 클럽" }));
    await waitFor(() => expect(clubAccessCalls(fetchMock, "sample-book-club")).toHaveLength(1));
  });

  it("keeps content and navigation available when the silent touch fails", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError("offline"));
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    renderLayout();

    expect(screen.getByRole("heading", { name: "클럽 콘텐츠" })).toBeInTheDocument();
    await user.click(screen.getByRole("link", { name: "같은 클럽 기록" }));
    expect(await screen.findByRole("heading", { name: "클럽 콘텐츠" })).toBeInTheDocument();
    expect(clubAccessCalls(fetchMock, "reading-sai")).toHaveLength(1);
  });
});

function clubAccessCalls(fetchMock: ReturnType<typeof vi.fn>, clubSlug: string) {
  const expected = `/api/bff/api/me/club-access?clubSlug=${clubSlug}`;
  return fetchMock.mock.calls.filter(([input, init]) => String(input) === expected && init?.method === "PUT");
}
