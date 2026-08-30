import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StrictMode, useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createMemoryRouter, Link, MemoryRouter, useLocation, useNavigate } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "react-router/dom";
import { AppRouteSecurityController } from "./app-route-security-controller";
import {
  createWorkspaceRouteTransitionStore,
  type WorkspaceRouteTransitionStore,
} from "./app-route-security-transition";
import { signalHostAuthorityLoss } from "@/shared/api/host-authority-event";
import type { AuthMeResponse } from "@/shared/auth/auth-contracts";
import type {
  AcceptedTransitionPublicationAction,
  PendingHandle,
  ReceiptRecoveryCapsule,
} from "@/shared/model/global-space";
import type { HostSensitiveStorage } from "@/features/host/storage/host-sensitive-storage";
import { hostClubQueryPrefix } from "@/features/host/queries/host-state-purge";
import {
  GlobalSpaceTransitionController,
  useGlobalSpaceTransitionController,
} from "./global-space-transition-controller";

let transitionStore: WorkspaceRouteTransitionStore;
let queryClient: QueryClient;

type CanonicalReceiptFields = {
  previewId: string | null;
  reasonCategory: string | null;
  reason: string | null;
  idempotencyKey: string | null;
};

type ProductionIngressScenario = {
  originalRequestCount: number;
  replayCount: number;
  active: PendingHandle | null;
  retired: PendingHandle | null;
  activeCanonical: CanonicalReceiptFields;
  retiredCanonical: CanonicalReceiptFields;
  activeInvalidations: number;
  retiredInvalidations: number;
  actions: AcceptedTransitionPublicationAction[];
  executeOriginalRequest: () => void;
  captureHandles: (active: PendingHandle, retired: PendingHandle) => void;
  captureActions: (actions: AcceptedTransitionPublicationAction[]) => void;
  recordReplay: () => void;
  recordInvalidation: (kind: "active" | "retired") => void;
};

function receiptCapsule(
  operationId: string,
  canonical: CanonicalReceiptFields,
  scenario: ProductionIngressScenario,
  kind: "active" | "retired",
): ReceiptRecoveryCapsule {
  return {
    operationId,
    reconcileOriginal: async () => {
      scenario.recordReplay();
      return { operationId, outcome: "succeeded" };
    },
    invalidateForAuthorityLoss: () => scenario.recordInvalidation(kind),
    clear: () => {
      canonical.previewId = null;
      canonical.reasonCategory = null;
      canonical.reason = null;
      canonical.idempotencyKey = null;
    },
  };
}

function ProductionPublicationHarness({ scenario }: { scenario: ProductionIngressScenario }) {
  const controller = useGlobalSpaceTransitionController();
  const navigate = useNavigate();
  const location = useLocation();
  const [ui, setUi] = useState(0);
  const [receiptCallbacks, setReceiptCallbacks] = useState(0);
  const [successCopy, setSuccessCopy] = useState(0);
  const [errorCopy, setErrorCopy] = useState(0);
  const [returnTarget, setReturnTarget] = useState(0);

  const publicationActions: AcceptedTransitionPublicationAction[] = [
    { surface: "ui", publish: () => setUi((count) => count + 1) },
    { surface: "cache", publish: () => queryClient.setQueryData(["publication-proof"], "published") },
    { surface: "receiptCallback", publish: () => setReceiptCallbacks((count) => count + 1) },
    { surface: "successCopy", publish: () => setSuccessCopy((count) => count + 1) },
    { surface: "errorCopy", publish: () => setErrorCopy((count) => count + 1) },
    { surface: "navigation", publish: () => void navigate("/admin/today") },
    { surface: "returnTarget", publish: () => setReturnTarget((count) => count + 1) },
    { surface: "sessionStorage", publish: () => window.sessionStorage.setItem("late-publication", "1") },
  ];

  return (
    <>
      <button
        type="button"
        onClick={() => {
          scenario.executeOriginalRequest();
          scenario.captureActions(publicationActions);
          const active = controller.registrationPort.beginPending({
            ownerId: "mounted-active-command",
            operationId: "active-operation",
            recovery: {
              kind: "receipt",
              capsule: receiptCapsule(
                "active-operation",
                scenario.activeCanonical,
                scenario,
                "active",
              ),
            },
          });
          const retired = controller.registrationPort.beginPending({
            ownerId: "restored-detached-command",
            operationId: "retired-operation",
            recovery: {
              kind: "receipt",
              capsule: receiptCapsule(
                "retired-operation",
                scenario.retiredCanonical,
                scenario,
                "retired",
              ),
            },
          });
          scenario.captureHandles(active, retired);
          retired.unregister();
          signalHostAuthorityLoss({
            code: "HOST_AUTHORITY_REVOKED",
            clubSlug: "reading-sai",
            requestKind: "PUBLIC_TAKEDOWN_CONFIRM",
          });
        }}
      >
        요청 후 권한 회수
      </button>
      <output aria-label="production-location">{location.pathname}</output>
      <output aria-label="production-retained">{controller.retainedRecoveryCount}</output>
      <output aria-label="ui-publications">{ui}</output>
      <output aria-label="receipt-publications">{receiptCallbacks}</output>
      <output aria-label="success-publications">{successCopy}</output>
      <output aria-label="error-publications">{errorCopy}</output>
      <output aria-label="return-target-publications">{returnTarget}</output>
    </>
  );
}

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

  it("forwards authority loss to the synchronous pre-purge callback before handled navigation", async () => {
    const onBeforeHostAuthorityPurge = vi.fn();
    render(
      <MemoryRouter initialEntries={["/clubs/reading-sai/app/host"]}>
        <QueryClientProvider client={queryClient}>
          <AppRouteSecurityController
            workspace="host"
            transitionStore={transitionStore}
            onBeforeHostAuthorityPurge={onBeforeHostAuthorityPurge}
          />
        </QueryClientProvider>
        <main><h1>오늘의 운영</h1></main>
      </MemoryRouter>,
    );

    act(() => signalHostAuthorityLoss({
      code: "HOST_AUTHORITY_REVOKED",
      clubSlug: "reading-sai",
      requestKind: "SESSION_RECORD_DRAFT_SAVE",
    }));

    expect(onBeforeHostAuthorityPurge).toHaveBeenCalledTimes(1);
    expect(onBeforeHostAuthorityPurge).toHaveBeenCalledWith(expect.objectContaining({
      code: "HOST_AUTHORITY_REVOKED",
      clubSlug: "reading-sai",
    }));
  });

  it("revokes active and retired receipts through the production ingress before async purge and rejects every late publication", async () => {
    let releasePurge!: () => void;
    const clearClub = vi.fn(() => new Promise<void>((resolve) => { releasePurge = resolve; }));
    const storage: HostSensitiveStorage = {
      register: vi.fn(() => vi.fn()),
      clearClub,
    };
    const canonicalFields = (): CanonicalReceiptFields => ({
      previewId: "preview-1",
      reasonCategory: "SECURITY_INCIDENT",
      reason: "bounded reason",
      idempotencyKey: "intent-1",
    });
    const scenario: ProductionIngressScenario = {
      originalRequestCount: 0,
      replayCount: 0,
      active: null,
      retired: null,
      activeCanonical: canonicalFields(),
      retiredCanonical: canonicalFields(),
      activeInvalidations: 0,
      retiredInvalidations: 0,
      actions: [],
      executeOriginalRequest() { this.originalRequestCount += 1; },
      captureHandles(active, retired) {
        this.active = active;
        this.retired = retired;
      },
      captureActions(actions) { this.actions = actions; },
      recordReplay() { this.replayCount += 1; },
      recordInvalidation(kind) {
        if (kind === "active") this.activeInvalidations += 1;
        else this.retiredInvalidations += 1;
      },
    };
    const auth: AuthMeResponse = {
      authenticated: true,
      userId: "user-1",
      membershipId: "membership-1",
      clubId: "club-1",
      email: null,
      displayName: "운영자",
      accountName: "operator",
      role: "MEMBER",
      membershipStatus: "ACTIVE",
      approvalState: "ACTIVE",
      availableSpaces: {
        version: 1,
        kinds: ["CLUBS"],
        clubs: [{
          clubId: "club-1",
          clubSlug: "reading-sai",
          clubName: "읽는사이",
          perspectives: ["MEMBER", "HOST"],
        }],
      },
    };
    const memberOnly: AuthMeResponse = {
      ...auth,
      availableSpaces: {
        version: 2,
        kinds: ["CLUBS"],
        clubs: [{
          clubId: "club-1",
          clubSlug: "reading-sai",
          clubName: "읽는사이",
          perspectives: ["MEMBER"],
        }],
      },
    };
    const hostPrivateKey = [...hostClubQueryPrefix("reading-sai"), "private"];
    queryClient.setQueryData(hostPrivateKey, "private");
    queryClient.setQueryData(["publication-proof"], "initial");

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={["/clubs/reading-sai/app/host"]}>
          <GlobalSpaceTransitionController
            auth={auth}
            loadLatestProjection={async () => memberOnly}
          >
            <AppRouteSecurityController
              workspace="host"
              transitionStore={transitionStore}
              hostAuthorityStorage={storage}
            />
            <ProductionPublicationHarness scenario={scenario} />
            <main><h1>오늘의 운영</h1></main>
          </GlobalSpaceTransitionController>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    act(() => screen.getByRole("button", { name: "요청 후 권한 회수" }).click());

    expect(scenario.originalRequestCount).toBe(1);
    expect(scenario.activeInvalidations).toBe(1);
    expect(scenario.retiredInvalidations).toBe(1);
    expect(scenario.activeCanonical).toEqual({
      previewId: null,
      reasonCategory: null,
      reason: null,
      idempotencyKey: null,
    });
    expect(scenario.retiredCanonical).toEqual(scenario.activeCanonical);
    await waitFor(() => expect(screen.getByLabelText("production-retained")).toHaveTextContent("0"));
    await waitFor(() => expect(clearClub).toHaveBeenCalledWith("reading-sai"));
    expect(queryClient.getQueryData(hostPrivateKey)).toBe("private");

    let activeSettlement!: Awaited<ReturnType<PendingHandle["settle"]>>;
    let retiredSettlement!: Awaited<ReturnType<PendingHandle["settle"]>>;
    let activeObservation!: Awaited<ReturnType<PendingHandle["reconcile"]>>;
    let retiredObservation!: Awaited<ReturnType<PendingHandle["reconcile"]>>;
    let publicationResults!: ReturnType<PendingHandle["publishAccepted"]>[];
    await act(async () => {
      activeSettlement = await scenario.active!.settle("succeeded");
      retiredSettlement = await scenario.retired!.settle("succeeded");
      publicationResults = scenario.actions.map((action) => scenario.active!.publishAccepted(action));
      activeObservation = await scenario.active!.reconcile();
      retiredObservation = await scenario.retired!.reconcile();
    });

    expect(activeSettlement).toBe("obsolete");
    expect(retiredSettlement).toBe("obsolete");
    expect(activeObservation).toEqual({ operationId: "active-operation", outcome: "authority-lost" });
    expect(retiredObservation).toEqual({ operationId: "retired-operation", outcome: "authority-lost" });
    expect(scenario.replayCount).toBe(0);
    expect(publicationResults).toEqual(Array(8).fill("rejected"));
    expect(queryClient.getQueryData(["publication-proof"])).toBe("initial");
    expect(screen.getByLabelText("ui-publications")).toHaveTextContent("0");
    expect(screen.getByLabelText("receipt-publications")).toHaveTextContent("0");
    expect(screen.getByLabelText("success-publications")).toHaveTextContent("0");
    expect(screen.getByLabelText("error-publications")).toHaveTextContent("0");
    expect(screen.getByLabelText("return-target-publications")).toHaveTextContent("0");
    expect(window.sessionStorage.getItem("late-publication")).toBeNull();
    expect(screen.getByLabelText("production-location"))
      .toHaveTextContent("/clubs/reading-sai/app/host");

    act(() => releasePurge());
    await waitFor(() => expect(screen.getByLabelText("production-location"))
      .toHaveTextContent("/clubs/reading-sai/app"));
    expect(queryClient.getQueryData(hostPrivateKey)).toBeUndefined();
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
