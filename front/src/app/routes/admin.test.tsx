import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createMemoryRouter, MemoryRouter, useLocation } from "react-router";
import { RouterProvider } from "react-router/dom";
import { useEffect, type PropsWithChildren } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useSpaceTransitionSafetyRegistration } from "@/shared/ui/space-transition-safety-context";
import type { AuthMeResponse } from "@/shared/auth/auth-contracts";
import type {
  PendingHandle,
  TransitionPublicationSurface,
  TransitionSafetyRegistrationPort,
} from "@/shared/model/global-space";
import { signalHostAuthorityLoss } from "@/shared/api/host-authority-event";
import { hostSensitiveStorage } from "@/features/host/storage/host-sensitive-storage";
import { hostClubQueryPrefix } from "@/features/host/queries/host-state-purge";
import { fetchAdminOperationCases } from "@/features/platform-admin/api/platform-admin-operations-api";
import { AdminClubsRoute } from "@/features/platform-admin/route/admin-clubs-route";
import { AdminShellController } from "@/features/platform-admin/route/admin-shell-controller";
import {
  platformAdminCapabilitiesQuery,
  platformAdminClubsInfiniteQuery,
  platformAdminKeys,
} from "@/features/platform-admin/queries/platform-admin-queries";
import { ReadMatesSessionExpiredError } from "@/shared/api/client";
import { logoutCurrentSession } from "@/shared/auth/session-api";
import { globalSpaceReturnTargetStorageKey } from "../global-space-continuity";
import { useGlobalSpaceTransitionController } from "../global-space-transition-controller";
import { AppGlobalSpaceSwitcherBridge } from "../global-space-switcher-bridge";
import {
  AdminPlatformAuthorityInvalidationBridge,
  AdminTransitionBoundary,
} from "./admin";

vi.mock("@/shared/auth/session-api", () => ({
  logoutCurrentSession: vi.fn(),
}));

vi.mock("@/features/platform-admin/api/platform-admin-operations-api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/platform-admin/api/platform-admin-operations-api")>()),
  fetchAdminOperationCases: vi.fn(),
}));

const auth: AuthMeResponse = {
  authenticated: true,
  userId: "admin-1",
  membershipId: null,
  clubId: null,
  email: null,
  displayName: "운영자",
  accountName: "operator",
  role: null,
  membershipStatus: null,
  approvalState: "ANONYMOUS",
  availableSpaces: { version: 1, kinds: ["PLATFORM"], clubs: [] },
};

const multiSpaceAuth: AuthMeResponse = {
  ...auth,
  availableSpaces: {
    version: 1,
    kinds: ["PLATFORM", "CLUBS"],
    clubs: [{
      clubId: "club-2",
      clubSlug: "other-club",
      clubName: "다른 모임",
      perspectives: ["MEMBER", "HOST"],
    }],
  },
};

function AdminTargetHostHarness({
  onPort,
  onSettled,
}: {
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
        onClick={() => void controller.requestTransition({
          productSpace: "clubs",
          clubId: "club-2",
          clubSlug: "other-club",
          perspective: "host",
        }).then((result) => onSettled(result.status))}
      >
        플랫폼에서 다른 클럽 호스트로
      </button>
      <output aria-label="admin-target-location">
        {`${location.pathname}${location.search}${location.hash}`}
      </output>
      <output aria-label="admin-target-safety">{controller.safety.kind}</output>
      <output aria-label="admin-target-spaces">
        {controller.availableIdentities.map((identity) => (
          identity.productSpace === "platform"
            ? "platform"
            : `${identity.clubSlug}:${identity.perspective}`
        )).join(",")}
      </output>
    </>
  );
}

function LocationProbe() {
  const location = useLocation();
  return <output aria-label="current-location">{location.pathname}</output>;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

let queryClient: QueryClient;

beforeEach(() => {
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  window.sessionStorage.clear();
  vi.mocked(fetchAdminOperationCases).mockResolvedValue({ items: [], nextCursor: null });
});

afterEach(() => {
  cleanup();
  window.sessionStorage.clear();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("AdminTransitionBoundary", () => {
  it("injects the app-owned safety registration port without a platform feature importing src/app", () => {
    const wrapper = ({ children }: PropsWithChildren) => (
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={["/admin/today"]}>
          <AdminTransitionBoundary auth={auth}>{children}</AdminTransitionBoundary>
        </MemoryRouter>
      </QueryClientProvider>
    );

    const { result } = renderHook(() => useSpaceTransitionSafetyRegistration(), { wrapper });

    expect(result.current.registerDirty).toEqual(expect.any(Function));
    expect(result.current.beginPending).toEqual(expect.any(Function));
  });

  it("invalidates a registered shell logout before platform authority-loss UI cleanup", async () => {
    const pendingLogout = deferred<Response>();
    vi.mocked(logoutCurrentSession).mockReturnValue(pendingLogout.promise);
    vi.mocked(fetchAdminOperationCases).mockResolvedValue({
      schema: "admin.operation_cases.v1",
      generatedAt: "2026-08-24T00:00:00Z",
      counts: { open: 0, critical: 0, assignedToMe: 0, snoozed: 0 },
      sources: [],
      items: [],
      nextCursor: null,
    });
    const assign = vi.fn();
    vi.stubGlobal("location", { assign });
    queryClient.setQueryData(platformAdminCapabilitiesQuery().queryKey, {
      schemaVersion: 1,
      role: "OWNER",
      status: "ACTIVE",
      capabilities: ["VIEW_CLUBS", "CREATE_CLUB"],
      generatedAt: "2026-08-24T00:00:00Z",
    });
    queryClient.setQueryData(platformAdminClubsInfiniteQuery({}).queryKey, {
      pages: [{ items: [], nextCursor: null }],
      pageParams: [undefined],
    });
    const invalidateQueries = vi.spyOn(queryClient, "invalidateQueries");
    let controller!: ReturnType<typeof useGlobalSpaceTransitionController>;

    function ControllerCapture() {
      const captured = useGlobalSpaceTransitionController();
      useEffect(() => {
        controller = captured;
      }, [captured]);
      return null;
    }

    const router = createMemoryRouter([
      {
        path: "/admin",
        element: (
          <AdminTransitionBoundary auth={auth}>
            <ControllerCapture />
            <AdminPlatformAuthorityInvalidationBridge>
              {(invalidateForPlatformAuthorityLoss) => (
                <AdminShellController
                  auth={auth}
                  onPlatformAuthorityLoss={invalidateForPlatformAuthorityLoss}
                />
              )}
            </AdminPlatformAuthorityInvalidationBridge>
          </AdminTransitionBoundary>
        ),
        children: [{ path: "clubs", element: <AdminClubsRoute /> }],
      },
    ], { initialEntries: ["/admin/clubs?search=alpha&onboarding=1"] });
    render(
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    );

    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    await waitFor(() => expect(controller).toBeDefined());
    const beginPending = vi.spyOn(controller.registrationPort, "beginPending");
    fireEvent.click(screen.getByRole("button", { name: "다른 계정으로 로그인" }));
    expect(logoutCurrentSession).toHaveBeenCalledTimes(1);
    expect(beginPending).toHaveBeenCalledTimes(1);
    const shellHandle = beginPending.mock.results[0]?.value;
    expect(shellHandle).toBeDefined();
    const settle = vi.spyOn(shellHandle, "settle");

    await act(async () => {
      await queryClient.fetchQuery({
        queryKey: [...platformAdminKeys.all, "separate-authority-probe"],
        queryFn: async () => {
          throw new ReadMatesSessionExpiredError();
        },
      }).catch(() => undefined);
    });

    await expect(shellHandle.reconcile()).resolves.toEqual({
      operationId: expect.stringMatching(/^admin-other-account-logout:/),
      outcome: "authority-lost",
    });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(router.state.location.search).toBe("?search=alpha");

    await act(async () => {
      pendingLogout.resolve(new Response(null, { status: 204 }));
      await pendingLogout.promise;
      await Promise.resolve();
    });

    expect(settle).toHaveBeenCalledWith("succeeded");
    await expect(settle.mock.results[0]?.value).resolves.toBe("obsolete");
    const latePublicationSurfaces = [
      "cache",
      "ui",
      "receiptCallback",
      "navigation",
      "returnTarget",
    ] as const satisfies readonly TransitionPublicationSurface[];
    const latePublications = latePublicationSurfaces.map((surface) => ({
      surface,
      publish: vi.fn(),
    }));
    for (const publication of latePublications) {
      expect(shellHandle.publishAccepted(publication)).toBe("rejected");
      expect(publication.publish).not.toHaveBeenCalled();
    }
    expect(logoutCurrentSession).toHaveBeenCalledTimes(1);
    expect(assign).not.toHaveBeenCalled();
    expect(invalidateQueries).not.toHaveBeenCalled();
    expect(
      screen.queryByText("로그아웃에 실패했습니다. 다시 시도해 주세요."),
    ).not.toBeInTheDocument();
    expect(queryClient.getQueryData(platformAdminKeys.capabilities())).toBeUndefined();
  });

  it("renders the shared projection-owned switcher and executes selection through the app controller", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      if (input.toString().includes("/api/bff/api/auth/me")) {
        return new Response(JSON.stringify(multiSpaceAuth), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      throw new Error(`Unexpected fetch: ${input.toString()}`);
    }));

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={["/admin/today"]}>
          <AdminTransitionBoundary auth={multiSpaceAuth}>
            <AppGlobalSpaceSwitcherBridge auth={multiSpaceAuth} />
            <LocationProbe />
          </AdminTransitionBoundary>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "공간 전환, 현재 플랫폼 운영" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "내 클럽" }));
    expect(screen.getByRole("menuitemradio", { name: "다른 모임 멤버로 보기" })).toBeInTheDocument();
    expect(screen.getByRole("menuitemradio", { name: "다른 모임 호스트로 운영" })).toBeInTheDocument();
    expect(screen.queryByText(/HOST|MEMBER|ACTIVE/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("menuitemradio", { name: "다른 모임 멤버로 보기" }));
    await waitFor(() => expect(screen.getByLabelText("current-location")).toHaveTextContent(
      "/clubs/other-club/app",
    ));
  });

  it("does not recreate destinations from legacy joined clubs omitted by availableSpaces", () => {
    const projectionOnlyPlatform: AuthMeResponse = {
      ...auth,
      joinedClubs: [{
        clubId: "legacy-club",
        clubSlug: "legacy-club",
        clubName: "레거시 모임",
        membershipId: "legacy-membership",
        role: "HOST",
        status: "ACTIVE",
        approvalState: "ACTIVE",
        primaryHost: null,
      }],
    };

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={["/admin/today"]}>
          <AdminTransitionBoundary auth={projectionOnlyPlatform}>
            <AppGlobalSpaceSwitcherBridge auth={projectionOnlyPlatform} />
          </AdminTransitionBoundary>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(screen.queryByRole("button", { name: /^공간 전환/ })).not.toBeInTheDocument();
    expect(screen.getByText("현재 공간 플랫폼 운영")).toHaveClass("rm-sr-only");
    expect(screen.queryByText("레거시 모임")).not.toBeInTheDocument();
  });

  it("subscribes once at the real admin boundary and cancels only a revoked target-host navigation", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(multiSpaceAuth), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    })));
    const clearClub = vi.spyOn(hostSensitiveStorage, "clearClub").mockResolvedValue();
    const targetQueryKey = [...hostClubQueryPrefix("other-club"), "admin-target-only"];
    queryClient.setQueryData(targetQueryKey, "remove-target");
    const targetIdentity = {
      productSpace: "clubs" as const,
      clubId: "club-2",
      clubSlug: "other-club",
      perspective: "host" as const,
    };
    const targetContinuityKey = globalSpaceReturnTargetStorageKey(targetIdentity);
    window.sessionStorage.setItem(targetContinuityKey, JSON.stringify({
      pathname: "/clubs/other-club/app/host",
      search: "",
      hash: "",
      focusId: null,
      scrollTop: 0,
    }));
    let destinationSignal: AbortSignal | null = null;
    const destinationLoader = vi.fn(({ request }: { request: Request }) => {
      destinationSignal = request.signal;
      return new Promise<null>((_resolve, reject) => {
        request.signal.addEventListener("abort", () => {
          reject(new DOMException("Admin target host was revoked", "AbortError"));
        }, { once: true });
      });
    });
    const settled: string[] = [];
    let registrationPort!: TransitionSafetyRegistrationPort;
    const initialEntry = {
      pathname: "/admin/today",
      search: "?queue=urgent",
      hash: "#platform-focus",
      state: { platformState: "preserve" },
    };
    const router = createMemoryRouter([
      {
        path: "/admin/today",
        element: (
          <AdminTransitionBoundary auth={multiSpaceAuth}>
            <AdminTargetHostHarness
              onPort={(port) => { registrationPort = port; }}
              onSettled={(status) => settled.push(status)}
            />
            <main><h1>플랫폼 운영</h1></main>
          </AdminTransitionBoundary>
        ),
      },
      {
        path: "/clubs/other-club/app/host",
        loader: destinationLoader,
        element: <main><h1>커밋되면 안 되는 플랫폼 대상 호스트</h1></main>,
      },
    ], { initialEntries: [initialEntry] });
    render(
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    );

    (await screen.findByRole("button", { name: "플랫폼에서 다른 클럽 호스트로" })).click();
    await waitFor(() => expect(destinationLoader).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(registrationPort).toBeDefined());
    let existingHandle!: PendingHandle;
    act(() => {
      existingHandle = registrationPort.beginPending({
        ownerId: "platform-source-work",
        operationId: "platform-source-operation",
        recovery: {
          kind: "authoritative-history",
          operationId: "platform-source-operation",
          reconcile: async () => ({
            operationId: "platform-source-operation",
            outcome: "still-unknown",
          }),
        },
      });
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
    expect(window.sessionStorage.getItem(targetContinuityKey)).toBeNull();
    expect(screen.getByLabelText("admin-target-spaces")).not.toHaveTextContent("other-club:host");
    expect(screen.getByLabelText("admin-target-spaces")).toHaveTextContent("platform");
    expect(screen.getByLabelText("admin-target-safety")).toHaveTextContent("pending");
    expect(router.state.location).toMatchObject(initialEntry);
    expect(screen.queryByRole("heading", {
      name: "커밋되면 안 되는 플랫폼 대상 호스트",
    })).not.toBeInTheDocument();

    await expect(existingHandle.settle("succeeded")).resolves.toBe("accepted");
    const freshHandle = registrationPort.beginPending({
      ownerId: "platform-fresh-work",
      operationId: "platform-fresh-operation",
      recovery: {
        kind: "authoritative-history",
        operationId: "platform-fresh-operation",
        reconcile: async () => ({
          operationId: "platform-fresh-operation",
          outcome: "still-unknown",
        }),
      },
    });
    await waitFor(() => expect(screen.getByLabelText("admin-target-safety")).toHaveTextContent("pending"));
    await expect(freshHandle.settle("succeeded")).resolves.toBe("accepted");
  });
});
