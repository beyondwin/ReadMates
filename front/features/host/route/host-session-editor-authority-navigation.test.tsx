import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createMemoryRouter, Link } from "react-router";
import { RouterProvider } from "react-router/dom";
import { AppRouteSecurityController } from "@/src/app/app-route-security-controller";
import { signalHostAuthorityLoss } from "@/shared/api/host-authority-event";
import { HOST_AUTHORITY_LOSS_HANDOFF_STATE_KEY } from "@/features/host/model/host-authority-navigation";
import { useDraftRouteNavigationGuard } from "./host-draft-route-navigation-guard";

let queryClient: QueryClient;

function OpenRecordDraftRoute() {
  useDraftRouteNavigationGuard(true);
  return (
    <>
      <AppRouteSecurityController workspace="host" />
      <main>
        <h1>열린 기록 초안</h1>
        <Link
          to="/clubs/reading-sai/app"
          state={{ [HOST_AUTHORITY_LOSS_HANDOFF_STATE_KEY]: "forged-handoff" }}
        >
          일반 멤버 이동
        </Link>
      </main>
    </>
  );
}

function MemberRoute() {
  return (
    <>
      <AppRouteSecurityController workspace="member" />
      <main><h1>멤버 홈</h1></main>
    </>
  );
}

function renderOpenRecordDraft() {
  const router = createMemoryRouter([
    {
      path: "/clubs/:clubSlug/app/host/meetings/:sessionId/record",
      element: <OpenRecordDraftRoute />,
    },
    {
      path: "/clubs/:clubSlug/app",
      element: <MemberRoute />,
    },
  ], {
    initialEntries: ["/clubs/reading-sai/app/host/meetings/session-1/record"],
  });
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return router;
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

describe("host record draft authority navigation", () => {
  it.each([
    ["MEMBERSHIP_SUSPENDED", "멤버십이 중지"],
    ["CROSS_CLUB_SCOPE", "요청한 모임 범위가 달라"],
  ] as const)("bypasses the open-draft blocker for %s", async (code, message) => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    const router = renderOpenRecordDraft();

    signalHostAuthorityLoss({
      code,
      clubSlug: "reading-sai",
      requestKind: "SESSION_RECORD_DRAFT_SAVE",
    });

    await waitFor(() => expect(router.state.location.pathname).toBe("/clubs/reading-sai/app"));
    expect(await screen.findByRole("status")).toHaveTextContent(message);
    expect(screen.getByRole("heading", { name: "멤버 홈" })).toHaveFocus();
    expect(confirm).not.toHaveBeenCalled();
  });

  it("keeps ordinary user navigation behind the open-draft confirmation", async () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    const router = renderOpenRecordDraft();

    await userEvent.click(screen.getByRole("link", { name: "일반 멤버 이동" }));

    await waitFor(() => expect(confirm).toHaveBeenCalledWith(
      "저장되지 않은 작업 초안이 있습니다. 이 화면을 떠날까요?",
    ));
    expect(router.state.location.pathname)
      .toBe("/clubs/reading-sai/app/host/meetings/session-1/record");
    expect(screen.getByRole("heading", { name: "열린 기록 초안" })).toBeInTheDocument();
  });
});
