import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StrictMode, useEffect, useState } from "react";
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
  SpaceIdentity,
  TransitionSafetyRegistrationPort,
} from "@/shared/model/global-space";
import type { HostSensitiveStorage } from "@/features/host/storage/host-sensitive-storage";
import { hostClubQueryPrefix } from "@/features/host/queries/host-state-purge";
import {
  GlobalSpaceTransitionController,
  useGlobalSpaceTransitionController,
} from "./global-space-transition-controller";
import { globalSpaceReturnTargetStorageKey } from "./global-space-continuity";

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

function PendingDataRouterTransitionHarness({
  onSettled,
}: {
  onSettled?: (status: string) => void;
} = {}) {
  const controller = useGlobalSpaceTransitionController();
  const location = useLocation();
  const [result, setResult] = useState("idle");

  return (
    <>
      <button
        type="button"
        onClick={() => void controller.requestTransition({ productSpace: "platform" }).then((next) => {
          onSettled?.(next.status);
          if (next.status !== "obsolete") setResult(next.status);
        })}
      >
        플랫폼 loader 시작
      </button>
      <output aria-label="pending-router-location">{location.pathname}</output>
      <output aria-label="pending-router-result">{result}</output>
      <main><h1>호스트 현재 화면</h1></main>
    </>
  );
}

function TargetHostDataRouterTransitionHarness({
  target,
  onPort,
  onSettled,
}: {
  target: SpaceIdentity;
  onPort: (port: TransitionSafetyRegistrationPort) => void;
  onSettled: (status: string) => void;
}) {
  const controller = useGlobalSpaceTransitionController();
  const location = useLocation();

  useEffect(() => onPort(controller.registrationPort), [controller.registrationPort, onPort]);

  return (
    <>
      <button
        type="button"
        onClick={() => void controller.requestTransition(target).then((result) => {
          onSettled(result.status);
        })}
      >
        다른 클럽 호스트 loader 시작
      </button>
      <output aria-label="target-host-location">
        {`${location.pathname}${location.search}${location.hash}`}
      </output>
      <output aria-label="target-host-safety">{controller.safety.kind}</output>
      <output aria-label="target-host-spaces">
        {controller.availableIdentities.map((identity) => (
          identity.productSpace === "platform"
            ? "platform"
            : `${identity.clubSlug}:${identity.perspective}`
        )).join(",")}
      </output>
    </>
  );
}

function AuthorityScopeHarness({
  captureHandle,
}: {
  captureHandle: (handle: PendingHandle) => void;
}) {
  const controller = useGlobalSpaceTransitionController();
  const location = useLocation();

  return (
    <>
      <button
        type="button"
        onClick={() => captureHandle(controller.registrationPort.beginPending({
          ownerId: "reading-sai-host-command",
          operationId: "reading-sai-operation",
          timeoutMs: 1,
          recovery: {
            kind: "authoritative-history",
            operationId: "reading-sai-operation",
            reconcile: async () => ({
              operationId: "reading-sai-operation",
              outcome: "still-unknown",
            }),
          },
        }))}
      >
        현재 클럽 작업 등록
      </button>
      <button type="button">현재 초점 유지</button>
      <output aria-label="scoped-safety">{controller.safety.kind}</output>
      <output aria-label="scoped-location">
        {`${location.pathname}${location.search}${location.hash}`}
      </output>
      <output aria-label="scoped-state">{JSON.stringify(location.state)}</output>
      <output aria-label="scoped-spaces">
        {controller.availableIdentities.map((identity) => (
          identity.productSpace === "platform"
            ? "platform"
            : `${identity.clubSlug}:${identity.perspective}`
        )).join(",")}
      </output>
    </>
  );
}

function multiClubHostAuth(): AuthMeResponse {
  return {
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
      kinds: ["PLATFORM", "CLUBS"],
      clubs: [
        {
          clubId: "club-1",
          clubSlug: "reading-sai",
          clubName: "읽는사이",
          perspectives: ["MEMBER", "HOST"],
        },
        {
          clubId: "club-2",
          clubSlug: "other-club",
          clubName: "다른 모임",
          perspectives: ["MEMBER", "HOST"],
        },
      ],
    },
  };
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
        version: 1,
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

  it("cancels a pending production Data Router loader before purge and lets only the safe route commit", async () => {
    const settled: string[] = [];
    let hostLoaderRequestCount = 0;
    const hostReloadSentinelKey = ["host-cancellation-reload-sentinel"] as const;
    const hostLoader = vi.fn(() => {
      hostLoaderRequestCount += 1;
      if (hostLoaderRequestCount > 1) {
        queryClient.setQueryData(hostReloadSentinelKey, "repopulated-by-cancellation");
      }
      return null;
    });
    let destinationLoaderSignal: AbortSignal | null = null;
    let resolveDestinationLoader!: () => void;
    const destinationLoader = vi.fn(({ request }: { request: Request }) => {
      destinationLoaderSignal = request.signal;
      return new Promise<null>((resolve, reject) => {
        resolveDestinationLoader = () => resolve(null);
        request.signal.addEventListener("abort", () => {
          reject(new DOMException("Superseded by authority-loss safety navigation", "AbortError"));
        }, { once: true });
      });
    });
    let releasePurge!: () => void;
    const purgeObservations: boolean[] = [];
    const storage: HostSensitiveStorage = {
      register: vi.fn(() => vi.fn()),
      clearClub: vi.fn(() => {
        purgeObservations.push(destinationLoaderSignal?.aborted === true);
        return new Promise<void>((resolve) => { releasePurge = resolve; });
      }),
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
        kinds: ["PLATFORM", "CLUBS"],
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
        version: 1,
        kinds: ["CLUBS"],
        clubs: [{
          clubId: "club-1",
          clubSlug: "reading-sai",
          clubName: "읽는사이",
          perspectives: ["MEMBER"],
        }],
      },
    };
    const loadLatestProjection = vi.fn()
      .mockResolvedValueOnce(auth)
      .mockResolvedValue(memberOnly);
    const loadRouteValidation = vi.fn(async () => ({
      projectionCurrent: true,
      loadedCaseIds: new Set<string>(),
      authorizedClubIds: new Set(["club-1"]),
      availableFocusIds: new Set<string>(),
      noteSessionIds: new Set<string>(),
      hostSessionIds: [] as string[],
    }));
    const hostIdentity = {
      productSpace: "clubs" as const,
      clubId: "club-1",
      clubSlug: "reading-sai",
      perspective: "host" as const,
    };
    const platformIdentity = { productSpace: "platform" as const };
    const router = createMemoryRouter([
      {
        id: "pending-host-route",
        path: "/clubs/reading-sai/app/host",
        loader: hostLoader,
        element: (
          <GlobalSpaceTransitionController
            auth={auth}
            loadLatestProjection={loadLatestProjection}
            loadRouteValidation={loadRouteValidation}
          >
            <AppRouteSecurityController
              workspace="host"
              transitionStore={transitionStore}
              hostAuthorityStorage={storage}
            />
            <PendingDataRouterTransitionHarness onSettled={(status) => settled.push(status)} />
          </GlobalSpaceTransitionController>
        ),
      },
      {
        id: "pending-platform-route",
        path: "/admin/today",
        loader: destinationLoader,
        element: <main><h1>취소되어야 할 플랫폼 화면</h1></main>,
      },
      {
        id: "pending-member-route",
        path: "/clubs/reading-sai/app",
        element: <main><h1>안전한 멤버 화면</h1></main>,
      },
    ], {
      initialEntries: ["/clubs/reading-sai/app/host"],
      hydrationData: { loaderData: { "pending-host-route": null } },
    });
    render(
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    );

    (await screen.findByRole("button", { name: "플랫폼 loader 시작" })).click();
    await waitFor(() => expect(destinationLoader).toHaveBeenCalledTimes(1));
    expect(router.state.navigation.location?.pathname).toBe("/admin/today");
    expect(router.state.location.pathname).toBe("/clubs/reading-sai/app/host");

    act(() => signalHostAuthorityLoss({
      code: "HOST_AUTHORITY_REVOKED",
      clubSlug: "reading-sai",
      requestKind: "SESSION_BASIC_SAVE",
    }));

    expect(destinationLoaderSignal?.aborted).toBe(true);
    await waitFor(() => expect(purgeObservations).toEqual([true]));
    expect(hostLoader).not.toHaveBeenCalled();
    expect(queryClient.getQueryData(hostReloadSentinelKey)).toBeUndefined();
    expect(router.state.location.pathname).toBe("/clubs/reading-sai/app/host");
    expect(router.state.location.hash).toMatch(/^#readmates-authority-loss-cancel-/);
    expect(screen.queryByRole("heading", { name: "취소되어야 할 플랫폼 화면" })).not.toBeInTheDocument();
    expect(window.sessionStorage.getItem(globalSpaceReturnTargetStorageKey(hostIdentity))).toBeNull();
    expect(window.sessionStorage.getItem(globalSpaceReturnTargetStorageKey(platformIdentity))).toBeNull();
    expect(screen.getByLabelText("pending-router-result")).toHaveTextContent("idle");
    await waitFor(() => expect(settled).toEqual(["obsolete"]));

    act(() => releasePurge());
    await waitFor(() => expect(router.state.location.pathname).toBe("/clubs/reading-sai/app"));
    expect(router.state.location.hash).toBe("");
    expect(screen.getByRole("heading", { name: "안전한 멤버 화면" })).toBeInTheDocument();
    expect(loadLatestProjection).toHaveBeenCalledTimes(2);
    expect(loadRouteValidation).toHaveBeenCalledTimes(3);

    await act(async () => {
      resolveDestinationLoader();
      await Promise.resolve();
    });
    expect(router.state.location.pathname).toBe("/clubs/reading-sai/app");
    expect(router.state.location.hash).toBe("");
    expect(hostLoader).not.toHaveBeenCalled();
    expect(queryClient.getQueryData(hostReloadSentinelKey)).toBeUndefined();
    expect(screen.queryByRole("heading", { name: "취소되어야 할 플랫폼 화면" })).not.toBeInTheDocument();
    expect(window.sessionStorage.getItem(globalSpaceReturnTargetStorageKey(hostIdentity))).toBeNull();
    expect(window.sessionStorage.getItem(globalSpaceReturnTargetStorageKey(platformIdentity))).toBeNull();
  });

  it("purges a background club without terminalizing the current club coordinator or changing browser state", async () => {
    const auth = multiClubHostAuth();
    const readingSaiHost = {
      productSpace: "clubs" as const,
      clubId: "club-1",
      clubSlug: "reading-sai",
      perspective: "host" as const,
    };
    const otherClubHost = {
      productSpace: "clubs" as const,
      clubId: "club-2",
      clubSlug: "other-club",
      perspective: "host" as const,
    };
    const readingSaiContinuityKey = globalSpaceReturnTargetStorageKey(readingSaiHost);
    const otherClubContinuityKey = globalSpaceReturnTargetStorageKey(otherClubHost);
    window.sessionStorage.setItem(readingSaiContinuityKey, "reading-sai-return-target");
    window.sessionStorage.setItem(otherClubContinuityKey, "other-club-return-target");
    const readingSaiQueryKey = [...hostClubQueryPrefix("reading-sai"), "background-scope"];
    const otherClubQueryKey = [...hostClubQueryPrefix("other-club"), "background-scope"];
    queryClient.setQueryData(readingSaiQueryKey, "keep");
    queryClient.setQueryData(otherClubQueryKey, "remove");
    const clearClub = vi.fn(async () => undefined);
    let handle: PendingHandle | null = null;
    const initialEntry = {
      pathname: "/clubs/reading-sai/app/host",
      search: "?section=overview",
      hash: "#current-section",
      state: { routeState: "preserve" },
    };
    const router = createMemoryRouter([{
      path: "/clubs/reading-sai/app/host",
      element: (
        <GlobalSpaceTransitionController auth={auth} loadLatestProjection={async () => auth}>
          <AppRouteSecurityController
            workspace="host"
            transitionStore={transitionStore}
            hostAuthorityStorage={{ register: vi.fn(() => vi.fn()), clearClub }}
          />
          <AuthorityScopeHarness captureHandle={(value) => { handle = value; }} />
          <main><h1>읽는사이 운영</h1></main>
        </GlobalSpaceTransitionController>
      ),
    }], { initialEntries: [initialEntry] });
    render(
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    );

    await userEvent.click(await screen.findByRole("button", { name: "현재 클럽 작업 등록" }));
    await waitFor(() => expect(screen.getByLabelText("scoped-safety")).toHaveTextContent("unknown-outcome"));
    await act(() => new Promise<void>((resolve) => {
      window.requestAnimationFrame(() => window.requestAnimationFrame(() => resolve()));
    }));
    const focusKeeper = screen.getByRole("button", { name: "현재 초점 유지" });
    focusKeeper.focus();
    expect(document.activeElement).toBe(focusKeeper);

    act(() => signalHostAuthorityLoss({
      code: "CROSS_CLUB_SCOPE",
      clubSlug: "other-club",
      requestKind: "MEMBER_LIST",
    }));

    await waitFor(() => expect(clearClub).toHaveBeenCalledWith("other-club"));
    await waitFor(() => expect(queryClient.getQueryData(otherClubQueryKey)).toBeUndefined());
    expect(queryClient.getQueryData(readingSaiQueryKey)).toBe("keep");
    expect(window.sessionStorage.getItem(otherClubContinuityKey)).toBeNull();
    expect(window.sessionStorage.getItem(readingSaiContinuityKey)).toBe("reading-sai-return-target");
    expect(screen.getByLabelText("scoped-spaces")).not.toHaveTextContent("other-club:host");
    expect(screen.getByLabelText("scoped-spaces")).toHaveTextContent("reading-sai:host");
    expect(screen.getByLabelText("scoped-safety")).toHaveTextContent("unknown-outcome");
    expect(router.state.location).toMatchObject(initialEntry);
    expect(document.querySelector(
      "[data-app-route-security-controller] [role='status']",
    )).not.toBeInTheDocument();
    expect(document.activeElement).toBe(focusKeeper);

    if (!handle) throw new Error("SCOPED_HANDLE_NOT_CAPTURED");
    await expect(handle.settle("succeeded")).resolves.toBe("accepted");
  });

  it("does not cancel a reading-sai transition when a background other-club event arrives", async () => {
    const auth = multiClubHostAuth();
    let destinationSignal: AbortSignal | null = null;
    let resolveDestination!: () => void;
    const destinationLoader = vi.fn(({ request }: { request: Request }) => {
      destinationSignal = request.signal;
      return new Promise<null>((resolve, reject) => {
        resolveDestination = () => resolve(null);
        request.signal.addEventListener("abort", () => {
          reject(new DOMException("Unexpected background-club cancellation", "AbortError"));
        }, { once: true });
      });
    });
    const clearClub = vi.fn(async () => undefined);
    const otherClubQueryKey = [...hostClubQueryPrefix("other-club"), "transition-scope"];
    queryClient.setQueryData(otherClubQueryKey, "remove");
    const settled: string[] = [];
    const router = createMemoryRouter([
      {
        path: "/clubs/reading-sai/app/host",
        element: (
          <GlobalSpaceTransitionController
            auth={auth}
            loadLatestProjection={async () => auth}
            loadRouteValidation={async () => ({
              projectionCurrent: true,
              loadedCaseIds: new Set<string>(),
              authorizedClubIds: new Set(["club-1", "club-2"]),
              availableFocusIds: new Set<string>(),
              noteSessionIds: new Set<string>(),
              hostSessionIds: [] as string[],
            })}
          >
            <AppRouteSecurityController
              workspace="host"
              transitionStore={transitionStore}
              hostAuthorityStorage={{ register: vi.fn(() => vi.fn()), clearClub }}
            />
            <PendingDataRouterTransitionHarness onSettled={(status) => settled.push(status)} />
          </GlobalSpaceTransitionController>
        ),
      },
      {
        path: "/admin/today",
        loader: destinationLoader,
        element: <main><h1>플랫폼 운영</h1></main>,
      },
    ], { initialEntries: ["/clubs/reading-sai/app/host"] });
    render(
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    );

    (await screen.findByRole("button", { name: "플랫폼 loader 시작" })).click();
    await waitFor(() => expect(destinationLoader).toHaveBeenCalledTimes(1));

    act(() => signalHostAuthorityLoss({
      code: "CROSS_CLUB_SCOPE",
      clubSlug: "other-club",
      requestKind: "MEMBER_LIST",
    }));

    await waitFor(() => expect(clearClub).toHaveBeenCalledWith("other-club"));
    await waitFor(() => expect(queryClient.getQueryData(otherClubQueryKey)).toBeUndefined());
    expect(destinationSignal?.aborted).toBe(false);
    expect(router.state.location.pathname).toBe("/clubs/reading-sai/app/host");
    expect(router.state.location.hash).toBe("");

    act(() => resolveDestination());
    await waitFor(() => expect(router.state.location.pathname).toBe("/admin/today"));
    await waitFor(() => expect(settled).toEqual(["navigated"]));
    expect(router.state.location.hash).toBe("");
  });

  it.each([
    {
      label: "member",
      pathname: "/clubs/reading-sai/app",
      workspace: "member" as const,
    },
    {
      label: "host",
      pathname: "/clubs/reading-sai/app/host",
      workspace: "host" as const,
    },
  ])("cancels only a revoked target-host navigation from a safe $label source", async ({
    pathname,
    workspace,
  }) => {
    const auth = multiClubHostAuth();
    const targetHost: SpaceIdentity = {
      productSpace: "clubs",
      clubId: "club-2",
      clubSlug: "other-club",
      perspective: "host",
    };
    const sourceIdentity: SpaceIdentity = {
      productSpace: "clubs",
      clubId: "club-1",
      clubSlug: "reading-sai",
      perspective: workspace,
    };
    let destinationSignal: AbortSignal | null = null;
    const destinationLoader = vi.fn(({ request }: { request: Request }) => {
      destinationSignal = request.signal;
      return new Promise<null>((_resolve, reject) => {
        request.signal.addEventListener("abort", () => {
          reject(new DOMException("Revoked target host was superseded", "AbortError"));
        }, { once: true });
      });
    });
    const clearClub = vi.fn(async () => undefined);
    const sourceQueryKey = [...hostClubQueryPrefix("reading-sai"), "target-only-source"];
    const targetQueryKey = [...hostClubQueryPrefix("other-club"), "target-only-revoked"];
    queryClient.setQueryData(sourceQueryKey, "keep-source");
    queryClient.setQueryData(targetQueryKey, "remove-target");
    const sourceContinuityKey = globalSpaceReturnTargetStorageKey(sourceIdentity);
    const targetContinuityKey = globalSpaceReturnTargetStorageKey(targetHost);
    window.sessionStorage.setItem(sourceContinuityKey, JSON.stringify({
      pathname,
      search: "?view=queue",
      hash: "#source-focus",
      focusId: null,
      scrollTop: 0,
    }));
    window.sessionStorage.setItem(targetContinuityKey, JSON.stringify({
      pathname: "/clubs/other-club/app/host",
      search: "",
      hash: "",
      focusId: null,
      scrollTop: 0,
    }));
    const settled: string[] = [];
    let registrationPort!: TransitionSafetyRegistrationPort;
    const initialEntry = {
      pathname,
      search: "?view=queue",
      hash: "#source-focus",
      state: { sourceState: `${workspace}-preserved` },
    };
    const router = createMemoryRouter([
      {
        path: pathname,
        element: (
          <GlobalSpaceTransitionController
            auth={auth}
            loadLatestProjection={async () => auth}
            loadRouteValidation={async () => ({
              projectionCurrent: true,
              loadedCaseIds: new Set<string>(),
              authorizedClubIds: new Set(["club-1", "club-2"]),
              availableFocusIds: new Set<string>(),
              noteSessionIds: new Set<string>(),
              hostSessionIds: [] as string[],
            })}
          >
            <AppRouteSecurityController
              workspace={workspace}
              transitionStore={transitionStore}
              hostAuthorityStorage={{ register: vi.fn(() => vi.fn()), clearClub }}
            />
            <TargetHostDataRouterTransitionHarness
              target={targetHost}
              onPort={(port) => { registrationPort = port; }}
              onSettled={(status) => settled.push(status)}
            />
            <main><h1>{workspace === "host" ? "읽는사이 운영" : "읽는사이 멤버"}</h1></main>
          </GlobalSpaceTransitionController>
        ),
      },
      {
        path: "/clubs/other-club/app/host",
        loader: destinationLoader,
        element: <main><h1>커밋되면 안 되는 다른 클럽 운영</h1></main>,
      },
    ], { initialEntries: [initialEntry] });
    render(
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    );

    (await screen.findByRole("button", { name: "다른 클럽 호스트 loader 시작" })).click();
    await waitFor(() => expect(destinationLoader).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(registrationPort).toBeDefined());
    const existingHandle = registrationPort.beginPending({
      ownerId: `${workspace}-source-work`,
      operationId: `${workspace}-source-operation`,
      recovery: {
        kind: "authoritative-history",
        operationId: `${workspace}-source-operation`,
        reconcile: async () => ({
          operationId: `${workspace}-source-operation`,
          outcome: "still-unknown",
        }),
      },
    });

    act(() => signalHostAuthorityLoss({
      code: "HOST_AUTHORITY_REVOKED",
      clubSlug: "other-club",
      requestKind: "SESSION_BASIC_SAVE",
    }));

    await waitFor(() => expect(destinationSignal?.aborted).toBe(true));
    await waitFor(() => expect(clearClub).toHaveBeenCalledTimes(1));
    expect(clearClub).toHaveBeenCalledWith("other-club");
    await waitFor(() => expect(settled).toEqual(["obsolete"]));
    await waitFor(() => expect(queryClient.getQueryData(targetQueryKey)).toBeUndefined());
    expect(queryClient.getQueryData(sourceQueryKey)).toBe("keep-source");
    expect(window.sessionStorage.getItem(targetContinuityKey)).toBeNull();
    expect(window.sessionStorage.getItem(sourceContinuityKey)).not.toBeNull();
    expect(screen.getByLabelText("target-host-spaces")).not.toHaveTextContent("other-club:host");
    expect(screen.getByLabelText("target-host-spaces")).toHaveTextContent(`reading-sai:${workspace}`);
    expect(screen.getByLabelText("target-host-safety")).toHaveTextContent("pending");
    expect(router.state.location).toMatchObject(initialEntry);
    expect(screen.queryByRole("heading", {
      name: "커밋되면 안 되는 다른 클럽 운영",
    })).not.toBeInTheDocument();

    await expect(existingHandle.settle("succeeded")).resolves.toBe("accepted");
    const freshHandle = registrationPort.beginPending({
      ownerId: `${workspace}-fresh-work`,
      operationId: `${workspace}-fresh-operation`,
      recovery: {
        kind: "authoritative-history",
        operationId: `${workspace}-fresh-operation`,
        reconcile: async () => ({
          operationId: `${workspace}-fresh-operation`,
          outcome: "still-unknown",
        }),
      },
    });
    await waitFor(() => expect(screen.getByLabelText("target-host-safety")).toHaveTextContent("pending"));
    await expect(freshHandle.settle("succeeded")).resolves.toBe("accepted");
  });

  it("fails closed to the safe member route without host-loader revalidation when same-club purge fails", async () => {
    const auth = multiClubHostAuth();
    const hostReloadSentinelKey = ["purge-failure-host-reload"] as const;
    const hostLoader = vi.fn(() => {
      queryClient.setQueryData(hostReloadSentinelKey, "repopulated");
      return null;
    });
    const hostSensitiveQueryKey = [...hostClubQueryPrefix("reading-sai"), "purge-failure-sensitive"];
    queryClient.setQueryData(hostSensitiveQueryKey, "private");
    const clearClub = vi.fn(async () => {
      throw new Error("local draft purge failed");
    });
    const loadLatestProjection = vi.fn(async () => auth);
    const initialEntry = {
      pathname: "/clubs/reading-sai/app/host",
      search: "?section=overview",
      hash: "",
      state: { routeState: "preserve" },
    };
    const observedHrefs: string[] = [];
    const router = createMemoryRouter([
      {
        id: "purge-failure-host-route",
        path: "/clubs/reading-sai/app/host",
        loader: hostLoader,
        element: (
          <GlobalSpaceTransitionController auth={auth} loadLatestProjection={loadLatestProjection}>
            <AppRouteSecurityController
              workspace="host"
              transitionStore={transitionStore}
              hostAuthorityStorage={{ register: vi.fn(() => vi.fn()), clearClub }}
            />
            <main><h1>읽는사이 운영</h1></main>
          </GlobalSpaceTransitionController>
        ),
      },
      {
        path: "/clubs/reading-sai/app",
        element: (
          <>
            <AppRouteSecurityController
              workspace="member"
              transitionStore={transitionStore}
              hostAuthorityStorage={{ register: vi.fn(() => vi.fn()), clearClub }}
            />
            <main><h1>안전한 멤버 화면</h1></main>
          </>
        ),
      },
    ], {
      initialEntries: [initialEntry],
      hydrationData: { loaderData: { "purge-failure-host-route": null } },
    });
    const unsubscribe = router.subscribe((state) => {
      observedHrefs.push(`${state.location.pathname}${state.location.search}${state.location.hash}`);
    });
    render(
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    );

    act(() => signalHostAuthorityLoss({
      code: "HOST_AUTHORITY_REVOKED",
      clubSlug: "reading-sai",
      requestKind: "SESSION_BASIC_SAVE",
    }));

    await waitFor(() => expect(clearClub).toHaveBeenCalledWith("reading-sai"));
    await waitFor(() => expect(observedHrefs.some((href) => (
      href.includes("#readmates-authority-loss-cancel-")
    ))).toBe(true));
    await waitFor(() => expect(router.state.location.pathname).toBe("/clubs/reading-sai/app"));
    expect(router.state.location.search).toBe("");
    expect(router.state.location.hash).toBe("");
    expect(hostLoader).not.toHaveBeenCalled();
    expect(queryClient.getQueryData(hostReloadSentinelKey)).toBeUndefined();
    expect(queryClient.getQueryData(hostSensitiveQueryKey)).toBeUndefined();
    expect(loadLatestProjection).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent(
      "호스트 권한이 해제되어 안전한 멤버 공간으로 이동했습니다.",
    ));
    await waitFor(() => expect(document.activeElement).toBe(
      screen.getByRole("heading", { name: "안전한 멤버 화면" }),
    ));
    unsubscribe();
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
