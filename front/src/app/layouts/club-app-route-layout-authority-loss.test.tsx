import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createMemoryRouter } from "react-router";
import { RouterProvider } from "react-router/dom";
import { signalHostAuthorityLoss } from "@/shared/api/host-authority-event";
import { AppRouteSecurityController } from "@/src/app/app-route-security-controller";
import { prepareWorkspaceRoute } from "@/src/app/app-route-security-transition";
import { currentSessionKeys } from "@/features/current-session/queries/current-session-queries";
import { hostMemberKeys } from "@/features/host/queries/host-members-queries";
import { hostSessionKeys } from "@/features/host/queries/host-session-queries";
import { hostSessionRecordKeys } from "@/features/host/queries/host-session-record-query-keys";
import { hostSensitiveStorage } from "@/features/host/storage/host-sensitive-storage";
import { HOST_AUTHORITY_LOSS_HANDOFF_STATE_KEY } from "@/features/host/model/host-authority-navigation";
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
  it("purges same-club host state before the same-club member view without deleting member or other-club cache", async () => {
    const exactContext = { clubSlug: "reading-sai" };
    const otherContext = { clubSlug: "other-club" };
    const exactHostKeys = [
      hostSessionKeys.detail("session-1", exactContext),
      hostSessionRecordKeys.editor("session-1", exactContext),
      hostMemberKeys.list(undefined, exactContext),
    ];
    const safeMemberKey = currentSessionKeys.current(exactContext);
    const otherClubHostKey = hostSessionKeys.detail("session-1", otherContext);
    for (const key of exactHostKeys) queryClient.setQueryData(key, { sensitive: true });
    queryClient.setQueryData(safeMemberKey, { memberSafe: true });
    queryClient.setQueryData(otherClubHostKey, { otherClub: true });

    const clearDraft = vi.fn();
    const unregisterDraft = hostSensitiveStorage.register({
      clubSlug: exactContext.clubSlug,
      resourceKey: "record-draft:session-1",
      clear: clearDraft,
    });
    let memberLoaderEvidence: {
      hostQueriesPresent: boolean;
      draftCleared: boolean;
    } | null = null;
    const router = createMemoryRouter([
      {
        path: "/clubs/:clubSlug/app/host/*",
        element: <HostRecordRoute />,
      },
      {
        path: "/clubs/:clubSlug/app",
        loader: () => {
          memberLoaderEvidence = {
            hostQueriesPresent: exactHostKeys.some((key) => queryClient.getQueryData(key) !== undefined),
            draftCleared: clearDraft.mock.calls.length > 0,
          };
          return {
            audience: "MEMBER",
            auth: { authenticated: true, currentMembership: null, joinedClubs: [] },
            club: null,
          };
        },
        element: <ClubMemberAppRouteLayout />,
        children: [{ index: true, element: <main><h1>멤버 홈</h1></main> }],
      },
    ], {
      initialEntries: [{
        pathname: "/clubs/reading-sai/app/host/people/membership-7",
        state: {
          membershipId: "membership-7",
          sessionId: "session-1",
          readmatesReturnTo: "/clubs/reading-sai/app/host/sessions/session-1",
        },
      }],
    });

    render(
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    );

    signalHostAuthorityLoss({
      code: "HOST_AUTHORITY_REVOKED",
      clubSlug: exactContext.clubSlug,
      requestKind: "MEMBER_LIST",
    });

    await waitFor(() => expect(router.state.location.pathname).toBe("/clubs/reading-sai/app"));
    expect(memberLoaderEvidence).toEqual({ hostQueriesPresent: false, draftCleared: true });
    for (const key of exactHostKeys) expect(queryClient.getQueryData(key)).toBeUndefined();
    expect(queryClient.getQueryData(safeMemberKey)).toEqual({ memberSafe: true });
    expect(queryClient.getQueryData(otherClubHostKey)).toEqual({ otherClub: true });
    expect(router.state.location.state).toEqual({
      [HOST_AUTHORITY_LOSS_HANDOFF_STATE_KEY]: expect.stringMatching(/^host-authority-loss-/),
    });
    expect(router.state.location.state).not.toHaveProperty("membershipId");
    expect(router.state.location.state).not.toHaveProperty("sessionId");
    unregisterDraft();
  });

  it("announces suspension and focuses the guest-safe heading after the route remount", async () => {
    prepareWorkspaceRoute({
      workspace: "member",
      clubScope: "/clubs/reading-sai/app",
      href: "/clubs/reading-sai/app",
      locationKey: "prior-member-route",
    });
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

    expect(await screen.findByRole("status"))
      .toHaveTextContent("호스트 공간으로 전환했습니다");

    signalHostAuthorityLoss({
      code: "MEMBERSHIP_SUSPENDED",
      clubSlug: "reading-sai",
      requestKind: "SESSION_RECORD_DRAFT_SAVE",
    });

    await waitFor(() => expect(router.state.location.pathname).toBe("/clubs/reading-sai/app"));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("멤버십이 중지"));
    expect(screen.getAllByRole("status")).toHaveLength(1);
    expect(screen.getByRole("heading", { name: "게스트 홈" })).toHaveFocus();

    await act(async () => router.navigate("/clubs/reading-sai/app/archive"));
    await act(async () => router.navigate(-1));
    await waitFor(() => expect(screen.queryByRole("status")).not.toBeInTheDocument());
  });
});
