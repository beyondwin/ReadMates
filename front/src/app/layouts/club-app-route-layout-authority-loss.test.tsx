import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createMemoryRouter } from "react-router";
import { RouterProvider } from "react-router/dom";
import { signalHostAuthorityLoss } from "@/shared/api/host-authority-event";
import { AppRouteSecurityController } from "@/src/app/app-route-security-controller";
import { ClubMemberAppRouteLayout } from "./club-app-route-layout";

let queryClient: QueryClient;

function HostRecordRoute() {
  return (
    <>
      <AppRouteSecurityController workspace="host" />
      <main><h1>열린 기록 초안</h1></main>
    </>
  );
}

beforeEach(() => {
  window.sessionStorage.clear();
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
});

afterEach(() => {
  cleanup();
  window.sessionStorage.clear();
  vi.restoreAllMocks();
});

describe("ClubMemberAppRouteLayout authority-loss handoff", () => {
  it("announces suspension and focuses the guest-safe heading after the route remount", async () => {
    const router = createMemoryRouter([
      {
        path: "/clubs/:clubSlug/app/host/*",
        element: <HostRecordRoute />,
      },
      {
        path: "/clubs/:clubSlug/app",
        loader: () => ({
          audience: "GUEST",
          auth: { authenticated: false, currentMembership: null, joinedClubs: [] },
          club: null,
        }),
        element: <ClubMemberAppRouteLayout />,
        children: [
          { index: true, element: <main><h1>게스트 홈</h1></main> },
          { path: "archive", element: <main><h1>게스트 기록</h1></main> },
        ],
      },
    ], {
      initialEntries: ["/clubs/reading-sai/app/host/meetings/session-1/record"],
    });

    render(
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    );

    signalHostAuthorityLoss({
      code: "MEMBERSHIP_SUSPENDED",
      clubSlug: "reading-sai",
      requestKind: "SESSION_RECORD_DRAFT_SAVE",
    });

    await waitFor(() => expect(router.state.location.pathname).toBe("/clubs/reading-sai/app"));
    expect(await screen.findByRole("status")).toHaveTextContent("멤버십이 중지");
    expect(screen.getAllByRole("status")).toHaveLength(1);
    expect(screen.getByRole("heading", { name: "게스트 홈" })).toHaveFocus();

    await act(async () => router.navigate("/clubs/reading-sai/app/archive"));
    await act(async () => router.navigate(-1));
    await waitFor(() => expect(screen.queryByRole("status")).not.toBeInTheDocument());
  });
});
