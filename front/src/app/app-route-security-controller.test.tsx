import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createMemoryRouter, Link, MemoryRouter, useLocation } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "react-router/dom";
import { AppRouteSecurityController } from "./app-route-security-controller";
import {
  createWorkspaceRouteTransitionStore,
  type WorkspaceRouteTransitionStore,
} from "./app-route-security-transition";
import { signalHostAuthorityLoss } from "@/shared/api/host-authority-event";

let transitionStore: WorkspaceRouteTransitionStore;
let queryClient: QueryClient;

function RouteControllerHarness() {
  const location = useLocation();
  const workspace = location.pathname.includes("/host") ? "host" : "member";
  const label = workspace === "host" ? "오늘의 운영" : "멤버 홈";

  return (
    <>
      <QueryClientProvider client={queryClient}>
        <AppRouteSecurityController workspace={workspace} transitionStore={transitionStore} />
      </QueryClientProvider>
      <main>
        <h1>{label}</h1>
        <Link to="/clubs/reading-sai/app">멤버로</Link>
        <Link to="/clubs/reading-sai/app/archive">멤버 기록으로</Link>
        <Link to="/clubs/reading-sai/app/host">호스트로</Link>
        <Link to="/clubs/reading-sai/app/host" onClick={(event) => event.preventDefault()}>
          취소된 호스트 전환
        </Link>
      </main>
    </>
  );
}

function RemountingWorkspaceScreen({
  workspace,
  label,
}: {
  workspace: "host" | "member";
  label: string;
}) {
  return (
    <>
      <QueryClientProvider client={queryClient}>
        <AppRouteSecurityController workspace={workspace} transitionStore={transitionStore} />
      </QueryClientProvider>
      <main><h1>{label}</h1></main>
    </>
  );
}

beforeEach(() => {
  window.sessionStorage.clear();
  transitionStore = createWorkspaceRouteTransitionStore({
    storage: window.sessionStorage,
    pageSessionId: "controller-test-page",
  });
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  document.title = "ReadMates";
});

afterEach(() => {
  cleanup();
  window.sessionStorage.clear();
  vi.restoreAllMocks();
});

describe("AppRouteSecurityController", () => {
  it("keeps the authority-loss reason through the real host-to-member controller remount", async () => {
    const router = createMemoryRouter([
      {
        path: "/clubs/:clubSlug/app/host/*",
        element: <RemountingWorkspaceScreen key="host-route-controller" workspace="host" label="모임 기록" />,
      },
      {
        path: "/clubs/:clubSlug/app",
        element: <RemountingWorkspaceScreen key="member-route-controller" workspace="member" label="멤버 홈" />,
      },
    ], {
      initialEntries: ["/clubs/reading-sai/app/host/meetings/session-1/record"],
    });
    render(<RouterProvider router={router} />);

    signalHostAuthorityLoss({
      code: "MEMBERSHIP_SUSPENDED",
      clubSlug: "reading-sai",
      requestKind: "SESSION_RECORD_DRAFT_SAVE",
    });

    await waitFor(() => expect(router.state.location.pathname).toBe("/clubs/reading-sai/app"));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("멤버십이 중지"));
    await act(() => new Promise<void>((resolve) => {
      window.requestAnimationFrame(() => window.requestAnimationFrame(() => resolve()));
    }));
    expect(screen.getByRole("status")).toHaveTextContent("멤버십이 중지");
    expect(screen.getAllByRole("status")).toHaveLength(1);
    expect(screen.getByRole("heading", { name: "멤버 홈" })).toHaveFocus();
  });

  it("does not replay an abandoned authority reason on a later same-path visit", async () => {
    let memberRouteAvailable = false;
    const router = createMemoryRouter([
      {
        path: "/clubs/:clubSlug/app/host/*",
        element: <RemountingWorkspaceScreen key="host-route-controller" workspace="host" label="모임 기록" />,
      },
      {
        path: "/clubs/:clubSlug/app",
        loader: () => {
          if (!memberRouteAvailable) {
            throw new Response(null, { status: 503, statusText: "Member route unavailable" });
          }
          return null;
        },
        element: <RemountingWorkspaceScreen key="member-route-controller" workspace="member" label="멤버 홈" />,
        errorElement: <main><h1>멤버 공간 로드 실패</h1></main>,
      },
    ], {
      initialEntries: ["/clubs/reading-sai/app/host/meetings/session-1/record"],
    });
    render(<RouterProvider router={router} />);

    signalHostAuthorityLoss({
      code: "MEMBERSHIP_SUSPENDED",
      clubSlug: "reading-sai",
      requestKind: "SESSION_RECORD_DRAFT_SAVE",
    });

    expect(await screen.findByRole("heading", { name: "멤버 공간 로드 실패" })).toBeInTheDocument();
    memberRouteAvailable = true;
    await act(async () => router.navigate("/clubs/reading-sai/app", { replace: true }));

    await waitFor(() => expect(screen.getByRole("heading", { name: "멤버 홈" })).toHaveFocus());
    expect(screen.getByRole("status")).toHaveTextContent("멤버 공간으로 전환했습니다");
    expect(screen.getByRole("status")).not.toHaveTextContent("멤버십이 중지");
  });

  it("announces authority loss after replacing the host route and focuses the safe heading", async () => {
    render(
      <MemoryRouter initialEntries={["/clubs/reading-sai/app/host"]}>
        <RouteControllerHarness />
      </MemoryRouter>,
    );
    await waitFor(() => expect(screen.getByRole("heading", { name: "오늘의 운영" })).toHaveFocus());

    signalHostAuthorityLoss({
      code: "MEMBERSHIP_SUSPENDED",
      clubSlug: "reading-sai",
      requestKind: "SESSION_RECORD_DRAFT_SAVE",
    });

    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("멤버십이 중지"));
    await waitFor(() => expect(screen.getByRole("heading", { name: "멤버 홈" })).toHaveFocus());
  });

  it("announces every committed member-host transition across click, Back, and Forward", async () => {
    const user = userEvent.setup();
    const router = createMemoryRouter(
      [{ path: "*", element: <RouteControllerHarness /> }],
      { initialEntries: ["/clubs/reading-sai/app"] },
    );

    render(<StrictMode><RouterProvider router={router} /></StrictMode>);

    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("heading", { name: "멤버 홈" })).toHaveFocus());
    expect(document.title).toBe("멤버 공간 · ReadMates");

    await user.click(screen.getByRole("link", { name: "호스트로" }));
    expect(await screen.findByRole("status")).toHaveTextContent("호스트 공간으로 전환했습니다");
    expect(screen.getAllByRole("status")).toHaveLength(1);
    await waitFor(() => expect(screen.getByRole("heading", { name: "오늘의 운영" })).toHaveFocus());
    expect(document.title).toBe("호스트 공간 · ReadMates");

    await user.click(screen.getByRole("link", { name: "멤버로" }));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("멤버 공간으로 전환했습니다"));
    await waitFor(() => expect(screen.getByRole("heading", { name: "멤버 홈" })).toHaveFocus());
    expect(document.title).toBe("멤버 공간 · ReadMates");

    await act(async () => router.navigate(-1));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("호스트 공간으로 전환했습니다"));
    await waitFor(() => expect(screen.getByRole("heading", { name: "오늘의 운영" })).toHaveFocus());
    expect(document.title).toBe("호스트 공간 · ReadMates");

    await act(async () => router.navigate(1));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("멤버 공간으로 전환했습니다"));
    await waitFor(() => expect(screen.getByRole("heading", { name: "멤버 홈" })).toHaveFocus());
    expect(document.title).toBe("멤버 공간 · ReadMates");
  });

  it("recognizes a committed transition when the route layout remounts", async () => {
    const member = render(
      <StrictMode>
        <MemoryRouter initialEntries={[{ pathname: "/clubs/reading-sai/app", key: "member-entry" }]}>
          <RouteControllerHarness />
        </MemoryRouter>
      </StrictMode>,
    );
    await waitFor(() => expect(screen.getByRole("heading", { name: "멤버 홈" })).toHaveFocus());
    member.unmount();

    render(
      <StrictMode>
        <MemoryRouter initialEntries={[{ pathname: "/clubs/reading-sai/app/host", key: "host-entry" }]}>
          <RouteControllerHarness />
        </MemoryRouter>
      </StrictMode>,
    );

    expect(await screen.findByRole("status")).toHaveTextContent("호스트 공간으로 전환했습니다");
    expect(screen.getAllByRole("status")).toHaveLength(1);
    await waitFor(() => expect(screen.getByRole("heading", { name: "오늘의 운영" })).toHaveFocus());
    expect(document.title).toBe("호스트 공간 · ReadMates");
  });

  it("canonicalizes one current prefix and restores title and focus on a same-route reload", async () => {
    document.title = "호스트 공간 · 멤버 공간 · 오늘 · 읽는사이";

    const mounted = render(
      <MemoryRouter initialEntries={[{ pathname: "/clubs/reading-sai/app/host", key: "host-reload" }]}>
        <RouteControllerHarness />
      </MemoryRouter>,
    );
    await waitFor(() => expect(screen.getByRole("heading", { name: "오늘의 운영" })).toHaveFocus());
    mounted.unmount();

    document.title = "멤버 공간 · 호스트 공간 · 오늘 · 읽는사이";
    render(
      <MemoryRouter initialEntries={[{ pathname: "/clubs/reading-sai/app/host", key: "host-reload" }]}>
        <RouteControllerHarness />
      </MemoryRouter>,
    );

    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("heading", { name: "오늘의 운영" })).toHaveFocus());
    expect(document.title).toBe("호스트 공간 · 오늘 · 읽는사이");
  });

  it("ignores a stale intent left by a modified, cancelled, or loader-failed navigation", async () => {
    window.sessionStorage.setItem("readmates:pending-workspace-transition", "host");
    document.title = "호스트 공간 · 멤버 공간 · 오늘 · 읽는사이";

    render(
      <MemoryRouter initialEntries={[{ pathname: "/clubs/reading-sai/app/host", key: "fresh-host-load" }]}>
        <RouteControllerHarness />
      </MemoryRouter>,
    );

    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("heading", { name: "오늘의 운영" })).toHaveFocus());
    expect(document.title).toBe("호스트 공간 · 오늘 · 읽는사이");
  });

  it("does not prepare a destination for modified or cancelled link activation", async () => {
    const user = userEvent.setup();
    const router = createMemoryRouter(
      [{ path: "*", element: <RouteControllerHarness /> }],
      { initialEntries: ["/clubs/reading-sai/app"] },
    );
    render(<RouterProvider router={router} />);
    await waitFor(() => expect(screen.getByRole("heading", { name: "멤버 홈" })).toHaveFocus());

    const keepModifiedNavigationInTestPage = (event: MouseEvent) => {
      if (event.ctrlKey) {
        event.preventDefault();
      }
    };
    window.addEventListener("click", keepModifiedNavigationInTestPage, { capture: true });
    await user.keyboard("{Control>}");
    await user.click(screen.getByRole("link", { name: "호스트로" }));
    await user.keyboard("{/Control}");
    window.removeEventListener("click", keepModifiedNavigationInTestPage, { capture: true });
    await user.click(screen.getByRole("link", { name: "취소된 호스트 전환" }));
    expect(router.state.location.pathname).toBe("/clubs/reading-sai/app");
    expect(screen.queryByRole("status")).not.toBeInTheDocument();

    await user.click(screen.getByRole("link", { name: "멤버 기록으로" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/clubs/reading-sai/app/archive"));
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(document.title).toBe("멤버 공간 · ReadMates");
  });

  it("does not commit a workspace receipt when the destination loader fails", async () => {
    const user = userEvent.setup();
    const router = createMemoryRouter(
      [
        { path: "/clubs/reading-sai/app", element: <RouteControllerHarness /> },
        { path: "/clubs/reading-sai/app/archive", element: <RouteControllerHarness /> },
        {
          path: "/clubs/reading-sai/app/host",
          loader: () => {
            throw new Response(null, { status: 503, statusText: "Host loader unavailable" });
          },
          errorElement: (
            <main>
              <h1>호스트 로드 실패</h1>
              <Link to="/clubs/reading-sai/app/archive">멤버 기록으로 돌아가기</Link>
            </main>
          ),
        },
      ],
      { initialEntries: ["/clubs/reading-sai/app"] },
    );
    render(<RouterProvider router={router} />);
    await waitFor(() => expect(screen.getByRole("heading", { name: "멤버 홈" })).toHaveFocus());

    await user.click(screen.getByRole("link", { name: "호스트로" }));
    expect(await screen.findByRole("heading", { name: "호스트 로드 실패" })).toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(document.title).toBe("멤버 공간 · ReadMates");

    await user.click(screen.getByRole("link", { name: "멤버 기록으로 돌아가기" }));
    await waitFor(() => expect(screen.getByRole("heading", { name: "멤버 홈" })).toHaveFocus());
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(document.title).toBe("멤버 공간 · ReadMates");
  });

  it("keeps committed transition feedback when session storage is unavailable", async () => {
    const member = render(
      <MemoryRouter initialEntries={[{ pathname: "/clubs/reading-sai/app", key: "member-no-storage" }]}>
        <RouteControllerHarness />
      </MemoryRouter>,
    );
    await waitFor(() => expect(screen.getByRole("heading", { name: "멤버 홈" })).toHaveFocus());
    member.unmount();

    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("storage unavailable");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("storage unavailable");
    });
    vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => {
      throw new Error("storage unavailable");
    });

    render(
      <MemoryRouter initialEntries={[{ pathname: "/clubs/reading-sai/app/host", key: "host-no-storage" }]}>
        <RouteControllerHarness />
      </MemoryRouter>,
    );

    expect(await screen.findByRole("status")).toHaveTextContent("호스트 공간으로 전환했습니다");
    await waitFor(() => expect(screen.getByRole("heading", { name: "오늘의 운영" })).toHaveFocus());
    expect(document.title).toBe("호스트 공간 · ReadMates");
  });
});
