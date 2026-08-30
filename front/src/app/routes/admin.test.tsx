import { act, cleanup, render, renderHook, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createMemoryRouter, MemoryRouter, useLocation } from "react-router";
import { RouterProvider } from "react-router/dom";
import { useEffect, type PropsWithChildren } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useSpaceTransitionSafetyRegistration } from "@/shared/ui/space-transition-safety-context";
import type { AuthMeResponse } from "@/shared/auth/auth-contracts";
import type { PendingHandle, TransitionSafetyRegistrationPort } from "@/shared/model/global-space";
import { signalHostAuthorityLoss } from "@/shared/api/host-authority-event";
import { hostSensitiveStorage } from "@/features/host/storage/host-sensitive-storage";
import { hostClubQueryPrefix } from "@/features/host/queries/host-state-purge";
import { fetchAdminOperationCases } from "@/features/platform-admin/api/platform-admin-operations-api";
import { globalSpaceReturnTargetStorageKey } from "../global-space-continuity";
import { useGlobalSpaceTransitionController } from "../global-space-transition-controller";
import { AdminTransitionBoundary } from "./admin";

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
