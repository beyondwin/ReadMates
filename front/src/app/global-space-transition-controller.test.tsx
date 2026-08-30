import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { MemoryRouter, useLocation } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AuthMeResponse } from "@/shared/auth/auth-contracts";
import type {
  RecoveryObservation,
  SpaceIdentity,
  TransitionSafetyRegistrationPort,
} from "@/shared/model/global-space";
import { adminOperationsKeys } from "@/features/platform-admin/queries/platform-admin-operations-queries";
import { fetchAdminOperationCases } from "@/features/platform-admin/api/platform-admin-operations-api";
import { fetchArchiveSessions, fetchNoteSessions } from "@/features/archive/api/archive-api";
import { fetchHostSessionDetail } from "@/features/host/api/host-api";
import { globalSpaceReturnTargetStorageKey } from "./global-space-continuity";
import {
  GlobalSpaceTransitionController,
  globalSpaceTransitionEpochKey,
  useGlobalSpaceTransitionController,
  type LatestSpaceProjectionLoader,
  type SpaceTransitionRequestResult,
  type SpaceRouteValidationLoader,
  type TransitionNavigation,
} from "./global-space-transition-controller";

vi.mock("@/features/platform-admin/api/platform-admin-operations-api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/platform-admin/api/platform-admin-operations-api")>()),
  fetchAdminOperationCases: vi.fn(),
}));
vi.mock("@/features/archive/api/archive-api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/archive/api/archive-api")>()),
  fetchArchiveSessions: vi.fn(),
  fetchNoteSessions: vi.fn(),
}));
vi.mock("@/features/host/api/host-api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/host/api/host-api")>()),
  fetchHostSessionDetail: vi.fn(),
  fetchHostSessions: vi.fn(),
}));

const platform: SpaceIdentity = { productSpace: "platform" };
const member: SpaceIdentity = {
  productSpace: "clubs",
  clubId: "club-1",
  clubSlug: "reading-sai",
  perspective: "member",
};
const host: SpaceIdentity = { ...member, perspective: "host" };
const otherHost: SpaceIdentity = {
  productSpace: "clubs",
  clubId: "club-2",
  clubSlug: "other-club",
  perspective: "host",
};

function authWithSpaces(
  kinds: Array<"PLATFORM" | "CLUBS">,
  perspectives: Array<"MEMBER" | "HOST"> = ["MEMBER"],
): AuthMeResponse {
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
      kinds,
      clubs: kinds.includes("CLUBS")
        ? [{
            clubId: "club-1",
            clubSlug: "reading-sai",
            clubName: "읽는사이",
            perspectives,
          }]
        : [],
    },
  };
}

function authWithTwoHostClubs(): AuthMeResponse {
  const auth = authWithSpaces(["PLATFORM", "CLUBS"], ["MEMBER", "HOST"]);
  return {
    ...auth,
    availableSpaces: {
      version: 1,
      kinds: ["PLATFORM", "CLUBS"],
      clubs: [
        ...auth.availableSpaces!.clubs,
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

function context(projectionCurrent = true) {
  return {
    projectionCurrent,
    loadedCaseIds: new Set<string>(),
    authorizedClubIds: new Set(["club-1"]),
    availableFocusIds: new Set<string>(),
    noteSessionIds: new Set<string>(),
    hostSessionIds: [] as string[],
  };
}

function Harness({
  onPort,
  onResult,
  onSettled,
}: {
  onPort?: (port: TransitionSafetyRegistrationPort) => void;
  onResult?: (result: SpaceTransitionRequestResult) => void;
  onSettled?: (status: string) => void;
}) {
  const controller = useGlobalSpaceTransitionController();
  const location = useLocation();
  const [result, setResult] = useState("idle");

  useEffect(() => onPort?.(controller.registrationPort), [controller.registrationPort, onPort]);

  return (
    <>
      <output aria-label="location">{`${location.pathname}${location.search}`}</output>
      <output aria-label="safety">{controller.safety.kind}</output>
      <output aria-label="result">{result}</output>
      <output aria-label="authority-target">{result.startsWith("/") ? result : ""}</output>
      <output aria-label="available-spaces">
        {controller.availableIdentities.map((identity) =>
          identity.productSpace === "platform" ? "platform" : `${identity.clubSlug}:${identity.perspective}`,
        ).join(",")}
      </output>
      <output aria-label="retained-recoveries">{controller.retainedRecoveryCount}</output>
      <output aria-label="restore-focus">
        {typeof location.state === "object" && location.state
          ? String((location.state as {
            readmatesGlobalSpaceRestore?: { focusId?: string | null };
          }).readmatesGlobalSpaceRestore?.focusId ?? "")
          : ""}
      </output>
      <button
        type="button"
        onClick={() => void controller.requestTransition(platform).then((next) => {
          onResult?.(next);
          onSettled?.(next.status);
          if (next.status !== "obsolete") setResult(next.status);
        })}
      >
        플랫폼으로
      </button>
      <button
        type="button"
        onClick={() => void controller.requestTransition(member).then((next) => {
          onResult?.(next);
          onSettled?.(next.status);
          if (next.status !== "obsolete") setResult(next.status);
        })}
      >
        클럽으로
      </button>
      <button
        type="button"
        onClick={() => void controller.requestTransition(host).then((next) => {
          onResult?.(next);
          onSettled?.(next.status);
          if (next.status !== "obsolete") setResult(next.status);
        })}
      >
        호스트로
      </button>
      <button
        type="button"
        onClick={() => void controller.requestTransition(otherHost).then((next) => {
          onResult?.(next);
          onSettled?.(next.status);
          if (next.status !== "obsolete") setResult(next.status);
        })}
      >
        다른 클럽 호스트로
      </button>
      <button
        type="button"
        onClick={() => void controller.resolveHostAuthorityLossTarget({
          code: "HOST_AUTHORITY_REVOKED",
          clubSlug: "reading-sai",
          requestKind: "SESSION_BASIC_SAVE",
        }).then(setResult)}
      >
        호스트 권한 회수
      </button>
      <button
        type="button"
        onClick={() => controller.invalidateForHostAuthorityLoss({
          code: "HOST_AUTHORITY_REVOKED",
          clubSlug: "reading-sai",
          requestKind: "SESSION_BASIC_SAVE",
        })}
      >
        호스트 권한 즉시 무효화
      </button>
      <button
        type="button"
        onClick={() => controller.invalidateForHostAuthorityLoss({
          code: "CROSS_CLUB_SCOPE",
          clubSlug: "other-club",
          requestKind: "MEMBER_LIST",
        })}
      >
        다른 클럽 권한 즉시 무효화
      </button>
    </>
  );
}

function renderController(input: {
  initialEntry?: string;
  auth?: AuthMeResponse;
  loadLatestProjection?: LatestSpaceProjectionLoader;
  loadRouteValidation?: SpaceRouteValidationLoader;
  confirmDirtyLeave?: (message: string) => boolean;
  onPort?: (port: TransitionSafetyRegistrationPort) => void;
  storage?: Storage;
  queryClient?: QueryClient;
  useProductionRouteValidation?: boolean;
  navigateTransition?: TransitionNavigation;
  onResult?: (result: SpaceTransitionRequestResult) => void;
  onSettled?: (status: string) => void;
} = {}) {
  const controllerAuth = input.auth ?? authWithSpaces(["PLATFORM", "CLUBS"]);
  const queryClient = input.queryClient ?? new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[input.initialEntry ?? "/admin/today"]}>
        <GlobalSpaceTransitionController
          auth={controllerAuth}
          loadLatestProjection={input.loadLatestProjection ?? (async () => controllerAuth)}
          loadRouteValidation={input.useProductionRouteValidation
            ? undefined
            : (input.loadRouteValidation ?? (async () => context()))}
          confirmDirtyLeave={input.confirmDirtyLeave}
          storage={input.storage}
          navigateTransition={input.navigateTransition}
        >
          <Harness onPort={input.onPort} onResult={input.onResult} onSettled={input.onSettled} />
        </GlobalSpaceTransitionController>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((next, fail) => {
    resolve = next;
    reject = fail;
  });
  return { promise, reject, resolve };
}

function observableStorage() {
  const values = new Map<string, string>();
  return {
    storage: {
      get length() { return values.size; },
      clear: vi.fn(() => values.clear()),
      getItem: vi.fn((key: string) => values.get(key) ?? null),
      key: vi.fn((index: number) => [...values.keys()][index] ?? null),
      removeItem: vi.fn((key: string) => { values.delete(key); }),
      setItem: vi.fn((key: string, value: string) => { values.set(key, value); }),
    } satisfies Storage,
    values,
  };
}

afterEach(() => {
  vi.useRealTimers();
  window.sessionStorage.clear();
  vi.restoreAllMocks();
  vi.mocked(fetchAdminOperationCases).mockReset();
  vi.mocked(fetchArchiveSessions).mockReset();
  vi.mocked(fetchNoteSessions).mockReset();
  vi.mocked(fetchHostSessionDetail).mockReset();
});

describe("GlobalSpaceTransitionController", () => {
  it("coordinates clean navigation from the legacy unscoped member route", async () => {
    renderController({ initialEntry: "/app" });

    await userEvent.click(screen.getByRole("button", { name: "플랫폼으로" }));

    await waitFor(() => expect(screen.getByLabelText("location")).toHaveTextContent("/admin/today"));
    expect(screen.getByLabelText("result")).toHaveTextContent("navigated");
  });

  it("revalidates the latest projection and route allowlist before restoring a target", async () => {
    const latest = authWithSpaces(["PLATFORM", "CLUBS"]);
    const loadLatestProjection = vi.fn(async () => latest);
    const loadRouteValidation = vi.fn<SpaceRouteValidationLoader>(async () => context());
    window.sessionStorage.setItem(
      globalSpaceReturnTargetStorageKey(platform),
      JSON.stringify({
        pathname: "/admin/today",
        search: "?q=book&case=stale-case&mode=detail",
        hash: "#unsafe",
        focusId: "stale-case",
        scrollTop: 720,
      }),
    );
    renderController({
      initialEntry: "/clubs/reading-sai/app",
      auth: latest,
      loadLatestProjection,
      loadRouteValidation,
    });

    await userEvent.click(screen.getByRole("button", { name: "플랫폼으로" }));

    await waitFor(() => expect(screen.getByLabelText("location")).toHaveTextContent("/admin/today?q=book"));
    expect(screen.getByLabelText("location")).not.toHaveTextContent("case=stale-case");
    expect(loadLatestProjection).toHaveBeenCalledTimes(1);
    expect(loadRouteValidation).toHaveBeenCalledWith(platform, latest, expect.objectContaining({
      pathname: "/admin/today",
    }), expect.anything());
  });

  it("uses a fresh route-owned case read to restore a current target while rejecting stale cache and cross-route focus", async () => {
    const auth = authWithSpaces(["PLATFORM", "CLUBS"]);
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    queryClient.setQueryData(adminOperationsKeys.detail("case-stale"), { id: "case-stale" });
    vi.mocked(fetchAdminOperationCases).mockResolvedValue({
      items: [{ id: "case-current" }],
      nextCursor: null,
    } as never);
    const observedStorage = observableStorage();
    observedStorage.storage.setItem(
      globalSpaceReturnTargetStorageKey(platform),
      JSON.stringify({
        pathname: "/admin/today",
        search: "?case=case-current&mode=detail",
        hash: "",
        focusId: "club-1",
        scrollTop: 0,
      }),
    );
    const current = renderController({
      initialEntry: "/clubs/reading-sai/app",
      auth,
      queryClient,
      storage: observedStorage.storage,
      useProductionRouteValidation: true,
    });

    await userEvent.click(screen.getByRole("button", { name: "플랫폼으로" }));
    await waitFor(() => expect(screen.getByLabelText("location"))
      .toHaveTextContent("/admin/today?case=case-current&mode=detail"));
    expect(screen.getByLabelText("restore-focus")).toHaveTextContent(/^$/);
    current.unmount();

    observedStorage.storage.setItem(
      globalSpaceReturnTargetStorageKey(platform),
      JSON.stringify({
        pathname: "/admin/today",
        search: "?case=case-stale&mode=detail",
        hash: "",
        focusId: null,
        scrollTop: 0,
      }),
    );
    renderController({
      initialEntry: "/clubs/reading-sai/app",
      auth,
      queryClient,
      storage: observedStorage.storage,
      useProductionRouteValidation: true,
    });
    await userEvent.click(screen.getByRole("button", { name: "플랫폼으로" }));

    await waitFor(() => expect(screen.getByLabelText("location")).toHaveTextContent("/admin/today"));
    expect(screen.getByLabelText("location")).not.toHaveTextContent("case-stale");
    expect(fetchAdminOperationCases).toHaveBeenCalledTimes(2);
  });

  it("restores member notes only from the fresh route-owned club session result", async () => {
    const auth = authWithSpaces(["PLATFORM", "CLUBS"], ["MEMBER", "HOST"]);
    vi.mocked(fetchAdminOperationCases).mockResolvedValue({ items: [], nextCursor: null } as never);
    vi.mocked(fetchArchiveSessions).mockResolvedValue({
      items: [{ sessionId: "archive-only" }],
      nextCursor: null,
    } as never);
    vi.mocked(fetchNoteSessions).mockResolvedValue({
      items: [{ sessionId: "session-current" }],
      nextCursor: null,
    } as never);
    const observedStorage = observableStorage();
    observedStorage.storage.setItem(
      globalSpaceReturnTargetStorageKey(member),
      JSON.stringify({
        pathname: "/clubs/reading-sai/app/notes",
        search: "?filter=questions&sessionId=session-current",
        hash: "",
        focusId: "session-current",
        scrollTop: 320,
      }),
    );
    renderController({
      auth,
      storage: observedStorage.storage,
      useProductionRouteValidation: true,
    });

    await userEvent.click(screen.getByRole("button", { name: "클럽으로" }));

    await waitFor(() => expect(screen.getByLabelText("location"))
      .toHaveTextContent("/clubs/reading-sai/app/notes?filter=questions&sessionId=session-current"));
    expect(screen.getByLabelText("restore-focus")).toHaveTextContent("session-current");
    expect(fetchNoteSessions).toHaveBeenCalledWith({ clubSlug: "reading-sai" }, { limit: 30 });
    expect(fetchArchiveSessions).not.toHaveBeenCalled();
  });

  it("rejects an archive-only session ID that is absent from the notes route authority", async () => {
    const auth = authWithSpaces(["PLATFORM", "CLUBS"], ["MEMBER", "HOST"]);
    vi.mocked(fetchAdminOperationCases).mockResolvedValue({ items: [], nextCursor: null } as never);
    vi.mocked(fetchArchiveSessions).mockResolvedValue({
      items: [{ sessionId: "archive-only" }],
      nextCursor: null,
    } as never);
    vi.mocked(fetchNoteSessions).mockResolvedValue({
      items: [{ sessionId: "notes-current" }],
      nextCursor: null,
    } as never);
    const observedStorage = observableStorage();
    observedStorage.storage.setItem(
      globalSpaceReturnTargetStorageKey(member),
      JSON.stringify({
        pathname: "/clubs/reading-sai/app/notes",
        search: "?sessionId=archive-only",
        hash: "",
        focusId: "archive-only",
        scrollTop: 0,
      }),
    );
    renderController({
      auth,
      storage: observedStorage.storage,
      useProductionRouteValidation: true,
    });

    await userEvent.click(screen.getByRole("button", { name: "클럽으로" }));

    await waitFor(() => expect(screen.getByLabelText("location"))
      .toHaveTextContent("/clubs/reading-sai/app/notes"));
    expect(screen.getByLabelText("location")).not.toHaveTextContent("archive-only");
    expect(screen.getByLabelText("restore-focus")).toHaveTextContent(/^$/);
  });

  it("restores a host session detail only after its route-owned detail read confirms the session", async () => {
    const auth = authWithSpaces(["PLATFORM", "CLUBS"], ["MEMBER", "HOST"]);
    vi.mocked(fetchAdminOperationCases).mockResolvedValue({ items: [], nextCursor: null } as never);
    vi.mocked(fetchHostSessionDetail).mockResolvedValue({ sessionId: "session-current" } as never);
    const observedStorage = observableStorage();
    observedStorage.storage.setItem(
      globalSpaceReturnTargetStorageKey(host),
      JSON.stringify({
        pathname: "/clubs/reading-sai/app/host/sessions/session-current/edit",
        search: "?task=attendance",
        hash: "",
        focusId: null,
        scrollTop: 0,
      }),
    );
    renderController({
      auth,
      storage: observedStorage.storage,
      useProductionRouteValidation: true,
    });

    await userEvent.click(screen.getByRole("button", { name: "호스트로" }));

    await waitFor(() => expect(screen.getByLabelText("location"))
      .toHaveTextContent("/clubs/reading-sai/app/host/sessions/session-current/edit?task=attendance"));
    expect(fetchHostSessionDetail).toHaveBeenCalledWith("session-current", { clubSlug: "reading-sai" });
  });

  it("falls back when the same-club host detail read does not confirm the stored session", async () => {
    const auth = authWithSpaces(["PLATFORM", "CLUBS"], ["MEMBER", "HOST"]);
    vi.mocked(fetchAdminOperationCases).mockResolvedValue({ items: [], nextCursor: null } as never);
    vi.mocked(fetchHostSessionDetail).mockResolvedValue({ sessionId: "session-other" } as never);
    const observedStorage = observableStorage();
    observedStorage.storage.setItem(
      globalSpaceReturnTargetStorageKey(host),
      JSON.stringify({
        pathname: "/clubs/reading-sai/app/host/sessions/session-stale/edit",
        search: "?task=attendance",
        hash: "",
        focusId: null,
        scrollTop: 0,
      }),
    );
    renderController({
      auth,
      storage: observedStorage.storage,
      useProductionRouteValidation: true,
    });

    await userEvent.click(screen.getByRole("button", { name: "호스트로" }));

    await waitFor(() => expect(screen.getByLabelText("location"))
      .toHaveTextContent("/clubs/reading-sai/app/host/sessions"));
    expect(fetchHostSessionDetail).toHaveBeenCalledTimes(1);
  });

  it.each([
    "/clubs/other-club/app/host/sessions/session-current/edit",
    "/clubs/%72eading-sai/app/host/sessions/session-current/edit",
    "/clubs/%E0%A4%A/app/host/sessions/session-current/edit",
  ])("rejects a cross-club, encoded, or malformed host target without fetching: %s", async (pathname) => {
    const auth = authWithSpaces(["PLATFORM", "CLUBS"], ["MEMBER", "HOST"]);
    vi.mocked(fetchAdminOperationCases).mockResolvedValue({ items: [], nextCursor: null } as never);
    vi.mocked(fetchHostSessionDetail).mockResolvedValue({ sessionId: "session-current" } as never);
    const observedStorage = observableStorage();
    observedStorage.storage.setItem(
      globalSpaceReturnTargetStorageKey(host),
      JSON.stringify({
        pathname,
        search: "?task=attendance",
        hash: "",
        focusId: null,
        scrollTop: 0,
      }),
    );
    renderController({
      auth,
      storage: observedStorage.storage,
      useProductionRouteValidation: true,
    });

    await userEvent.click(screen.getByRole("button", { name: "호스트로" }));

    await waitFor(() => expect(screen.getByLabelText("result")).toHaveTextContent("navigated"));
    expect(screen.getByLabelText("location")).not.toHaveTextContent(pathname);
    expect(fetchHostSessionDetail).not.toHaveBeenCalled();
  });

  it("confirms dirty state and preserves the route when the operator cancels", async () => {
    let port!: TransitionSafetyRegistrationPort;
    const confirmDirtyLeave = vi.fn(() => false);
    renderController({ confirmDirtyLeave, onPort: (value) => { port = value; } });
    await waitFor(() => expect(port).toBeDefined());
    act(() => port.registerDirty("editor", "작성 중인 내용이 있습니다."));

    await userEvent.click(screen.getByRole("button", { name: "클럽으로" }));

    expect(confirmDirtyLeave).toHaveBeenCalledWith("작성 중인 내용이 있습니다.");
    expect(screen.getByLabelText("result")).toHaveTextContent("cancelled");
    expect(screen.getByLabelText("location")).toHaveTextContent("/admin/today");
  });

  it("continues a dirty transition only after explicit confirmation", async () => {
    let port!: TransitionSafetyRegistrationPort;
    renderController({
      confirmDirtyLeave: () => true,
      onPort: (value) => { port = value; },
    });
    await waitFor(() => expect(port).toBeDefined());
    act(() => port.registerDirty("editor", "작성 중인 내용이 있습니다."));

    await userEvent.click(screen.getByRole("button", { name: "클럽으로" }));

    await waitFor(() => expect(screen.getByLabelText("location")).toHaveTextContent("/clubs/reading-sai/app"));
    expect(screen.getByLabelText("result")).toHaveTextContent("navigated");
  });

  it("blocks pending state and reconciles the same operation after timeout without replaying navigation", async () => {
    vi.useFakeTimers();
    let port!: TransitionSafetyRegistrationPort;
    const reconcile = vi.fn(async (): Promise<RecoveryObservation> => ({
      operationId: "operation-1",
      outcome: "still-unknown",
    }));
    renderController({ onPort: (value) => { port = value; } });
    await act(async () => Promise.resolve());
    port.beginPending({
      ownerId: "editor",
      operationId: "operation-1",
      timeoutMs: 10,
      recovery: { kind: "authoritative-history", operationId: "operation-1", reconcile },
    });

    await act(async () => {
      screen.getByRole("button", { name: "클럽으로" }).click();
      await Promise.resolve();
    });
    expect(screen.getByLabelText("result")).toHaveTextContent("blocked-pending");
    expect(reconcile).not.toHaveBeenCalled();

    act(() => vi.advanceTimersByTime(10));
    expect(screen.getByLabelText("safety")).toHaveTextContent("unknown-outcome");
    await act(async () => {
      screen.getByRole("button", { name: "클럽으로" }).click();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(reconcile).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText("result")).toHaveTextContent("blocked-unknown");
    expect(screen.getByLabelText("location")).toHaveTextContent("/admin/today");
  });

  it("fails closed when the requested space disappears from the refreshed projection", async () => {
    const loadLatestProjection = vi.fn(async () => authWithSpaces(["CLUBS"]));
    renderController({ loadLatestProjection });

    await userEvent.click(screen.getByRole("button", { name: "플랫폼으로" }));

    expect(screen.getByLabelText("result")).toHaveTextContent("unavailable");
    expect(screen.getByLabelText("location")).toHaveTextContent("/admin/today");
  });

  it("fails closed without publishing navigation when projection refresh rejects", async () => {
    renderController({
      loadLatestProjection: async () => { throw new Error("projection unavailable"); },
    });

    await userEvent.click(screen.getByRole("button", { name: "클럽으로" }));

    await waitFor(() => expect(screen.getByLabelText("result")).toHaveTextContent("unavailable"));
    expect(screen.getByLabelText("location")).toHaveTextContent("/admin/today");
  });

  it("drops a user transition when host authority loss advances the intent during route validation", async () => {
    const validation = deferred<ReturnType<typeof context>>();
    const routeValidation = vi.fn<SpaceRouteValidationLoader>(() => validation.promise);
    const observedStorage = observableStorage();
    renderController({
      initialEntry: "/clubs/reading-sai/app/host",
      auth: authWithSpaces(["PLATFORM", "CLUBS"], ["MEMBER", "HOST"]),
      loadRouteValidation: routeValidation,
      storage: observedStorage.storage,
    });

    screen.getByRole("button", { name: "플랫폼으로" }).click();
    await waitFor(() => expect(routeValidation).toHaveBeenCalled());
    screen.getByRole("button", { name: "호스트 권한 즉시 무효화" }).click();
    validation.resolve(context());

    await act(async () => validation.promise);
    expect(screen.getByLabelText("location")).toHaveTextContent("/clubs/reading-sai/app/host");
    expect(screen.getByLabelText("result")).toHaveTextContent("idle");
    expect(observedStorage.storage.setItem).not.toHaveBeenCalled();
  });

  it("defers continuity publication until destination validation survives the authority generation", async () => {
    const destinationValidation = deferred<ReturnType<typeof context>>();
    const routeValidation = vi.fn<SpaceRouteValidationLoader>()
      .mockResolvedValueOnce(context())
      .mockReturnValueOnce(destinationValidation.promise);
    const observedStorage = observableStorage();
    renderController({
      initialEntry: "/clubs/reading-sai/app/host",
      auth: authWithSpaces(["PLATFORM", "CLUBS"], ["MEMBER", "HOST"]),
      loadRouteValidation: routeValidation,
      storage: observedStorage.storage,
    });

    screen.getByRole("button", { name: "플랫폼으로" }).click();
    await waitFor(() => expect(routeValidation).toHaveBeenCalledTimes(2));
    expect(observedStorage.storage.setItem).not.toHaveBeenCalled();
    act(() => screen.getByRole("button", { name: "호스트 권한 즉시 무효화" }).click());
    destinationValidation.resolve(context());

    await act(async () => destinationValidation.promise);
    expect(screen.getByLabelText("location")).toHaveTextContent("/clubs/reading-sai/app/host");
    expect(screen.getByLabelText("result")).toHaveTextContent("idle");
    expect(observedStorage.storage.setItem).not.toHaveBeenCalled();
  });

  it("does not let an obsolete production validation read publish into Query cache", async () => {
    const freshCases = deferred<Awaited<ReturnType<typeof fetchAdminOperationCases>>>();
    vi.mocked(fetchAdminOperationCases).mockReturnValue(freshCases.promise);
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const observedStorage = observableStorage();
    observedStorage.storage.setItem(
      globalSpaceReturnTargetStorageKey(platform),
      JSON.stringify({
        pathname: "/admin/today",
        search: "?case=late-case&mode=detail",
        hash: "",
        focusId: "late-case",
        scrollTop: 0,
      }),
    );
    renderController({
      initialEntry: "/clubs/reading-sai/app/host",
      auth: authWithSpaces(["PLATFORM", "CLUBS"], ["MEMBER", "HOST"]),
      queryClient,
      storage: observedStorage.storage,
      useProductionRouteValidation: true,
    });

    screen.getByRole("button", { name: "플랫폼으로" }).click();
    await waitFor(() => expect(fetchAdminOperationCases).toHaveBeenCalledTimes(1));
    act(() => screen.getByRole("button", { name: "호스트 권한 즉시 무효화" }).click());
    freshCases.resolve({ items: [{ id: "late-case" }], nextCursor: null } as never);

    await act(async () => freshCases.promise);
    expect(queryClient.getQueriesData({ queryKey: adminOperationsKeys.all })).toEqual([]);
    expect(screen.getByLabelText("location")).toHaveTextContent("/clubs/reading-sai/app/host");
    expect(screen.getByLabelText("result")).toHaveTextContent("idle");
    expect(observedStorage.storage.setItem).toHaveBeenCalledTimes(1);
  });

  it("publishes only the newest user transition when projection refreshes settle out of order", async () => {
    const first = deferred<AuthMeResponse | null>();
    const second = deferred<AuthMeResponse | null>();
    const auth = authWithSpaces(["PLATFORM", "CLUBS"]);
    const loadLatestProjection = vi.fn<LatestSpaceProjectionLoader>()
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    const observedStorage = observableStorage();
    renderController({
      initialEntry: "/clubs/reading-sai/app",
      auth,
      loadLatestProjection,
      loadRouteValidation: async () => context(),
      storage: observedStorage.storage,
    });

    screen.getByRole("button", { name: "플랫폼으로" }).click();
    screen.getByRole("button", { name: "클럽으로" }).click();
    second.resolve(auth);
    await act(async () => second.promise);
    await waitFor(() => expect(screen.getByLabelText("result")).toHaveTextContent("navigated"));
    const acceptedPublicationCount = vi.mocked(observedStorage.storage.setItem).mock.calls.length;
    expect(acceptedPublicationCount).toBeGreaterThan(0);
    first.resolve(auth);
    await act(async () => first.promise);

    expect(screen.getByLabelText("location")).toHaveTextContent("/clubs/reading-sai/app");
    expect(observedStorage.storage.setItem).toHaveBeenCalledTimes(acceptedPublicationCount);
  });

  it("keeps a background-revoked host club fenced when an older projection settles later", async () => {
    const projection = deferred<AuthMeResponse | null>();
    const auth = authWithTwoHostClubs();
    const loadLatestProjection = vi.fn<LatestSpaceProjectionLoader>()
      .mockReturnValueOnce(projection.promise)
      .mockResolvedValue(auth);
    const settled: string[] = [];
    renderController({
      initialEntry: "/clubs/reading-sai/app/host",
      auth,
      loadLatestProjection,
      onSettled: (status) => settled.push(status),
    });

    screen.getByRole("button", { name: "플랫폼으로" }).click();
    await waitFor(() => expect(loadLatestProjection).toHaveBeenCalledTimes(1));
    act(() => screen.getByRole("button", { name: "다른 클럽 권한 즉시 무효화" }).click());
    projection.resolve(auth);

    await waitFor(() => expect(screen.getByLabelText("location")).toHaveTextContent("/admin/today"));
    expect(screen.getByLabelText("available-spaces")).not.toHaveTextContent("other-club:host");
    await userEvent.click(screen.getByRole("button", { name: "다른 클럽 호스트로" }));

    await waitFor(() => expect(settled).toEqual(["navigated", "unavailable"]));
    expect(screen.getByLabelText("location")).toHaveTextContent("/admin/today");
    expect(screen.getByLabelText("result")).toHaveTextContent("unavailable");
    expect(screen.getByLabelText("available-spaces")).not.toHaveTextContent("other-club:host");
  });

  it("keeps the newer UI result when an obsolete projection refresh rejects", async () => {
    const first = deferred<AuthMeResponse | null>();
    const auth = authWithSpaces(["PLATFORM", "CLUBS"]);
    const loadLatestProjection = vi.fn<LatestSpaceProjectionLoader>()
      .mockReturnValueOnce(first.promise)
      .mockResolvedValueOnce(auth);
    const settled: string[] = [];
    renderController({
      initialEntry: "/clubs/reading-sai/app",
      auth,
      loadLatestProjection,
      onSettled: (status) => settled.push(status),
    });

    screen.getByRole("button", { name: "플랫폼으로" }).click();
    screen.getByRole("button", { name: "클럽으로" }).click();
    await waitFor(() => expect(screen.getByLabelText("result")).toHaveTextContent("navigated"));
    first.reject(new Error("obsolete projection failed"));

    await waitFor(() => expect(settled).toEqual(["navigated", "obsolete"]));
    expect(screen.getByLabelText("result")).toHaveTextContent("navigated");
    expect(screen.getByLabelText("location")).toHaveTextContent("/clubs/reading-sai/app");
  });

  it("keeps the newer navigation when an obsolete route validation rejects", async () => {
    const firstValidation = deferred<ReturnType<typeof context>>();
    const routeValidation = vi.fn<SpaceRouteValidationLoader>()
      .mockReturnValueOnce(firstValidation.promise)
      .mockResolvedValue(context());
    const settled: string[] = [];
    renderController({
      initialEntry: "/clubs/reading-sai/app",
      loadRouteValidation: routeValidation,
      onSettled: (status) => settled.push(status),
    });

    screen.getByRole("button", { name: "플랫폼으로" }).click();
    await waitFor(() => expect(routeValidation).toHaveBeenCalledTimes(1));
    screen.getByRole("button", { name: "클럽으로" }).click();
    await waitFor(() => expect(screen.getByLabelText("result")).toHaveTextContent("navigated"));
    firstValidation.reject(new Error("obsolete validation failed"));

    await waitFor(() => expect(settled).toEqual(["navigated", "obsolete"]));
    expect(screen.getByLabelText("result")).toHaveTextContent("navigated");
    expect(screen.getByLabelText("location")).toHaveTextContent("/clubs/reading-sai/app");
  });

  it("returns obsolete when authority loss wins before unknown-outcome reconciliation rejects", async () => {
    vi.useFakeTimers();
    let port!: TransitionSafetyRegistrationPort;
    const reconciliation = deferred<RecoveryObservation>();
    const reconcile = vi.fn(() => reconciliation.promise);
    const settled: string[] = [];
    renderController({
      initialEntry: "/clubs/reading-sai/app/host",
      auth: authWithSpaces(["PLATFORM", "CLUBS"], ["MEMBER", "HOST"]),
      onPort: (value) => { port = value; },
      onSettled: (status) => settled.push(status),
    });
    await act(async () => Promise.resolve());
    port.beginPending({
      ownerId: "unknown-rejection",
      operationId: "unknown-operation",
      timeoutMs: 1,
      recovery: { kind: "authoritative-history", operationId: "unknown-operation", reconcile },
    });
    act(() => vi.advanceTimersByTime(1));

    screen.getByRole("button", { name: "클럽으로" }).click();
    await act(async () => Promise.resolve());
    expect(reconcile).toHaveBeenCalledTimes(1);
    act(() => screen.getByRole("button", { name: "호스트 권한 즉시 무효화" }).click());
    reconciliation.reject(new Error("obsolete reconciliation failed"));

    await act(async () => Promise.resolve());
    expect(settled).toEqual(["obsolete"]);
    expect(screen.getByLabelText("result")).toHaveTextContent("idle");
  });

  it("keeps a current rejected reconciliation blocked on the same unknown operation", async () => {
    vi.useFakeTimers();
    let port!: TransitionSafetyRegistrationPort;
    const reconcile = vi.fn(async (): Promise<RecoveryObservation> => {
      throw new Error("authoritative history unavailable");
    });
    const settled: string[] = [];
    const results: SpaceTransitionRequestResult[] = [];
    renderController({
      onPort: (value) => { port = value; },
      onResult: (result) => results.push(result),
      onSettled: (status) => settled.push(status),
    });
    await act(async () => Promise.resolve());
    port.beginPending({
      ownerId: "current-rejection",
      operationId: "current-unknown-operation",
      timeoutMs: 1,
      recovery: {
        kind: "authoritative-history",
        operationId: "current-unknown-operation",
        reconcile,
      },
    });
    act(() => vi.advanceTimersByTime(1));

    await act(async () => {
      screen.getByRole("button", { name: "클럽으로" }).click();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(settled).toEqual(["blocked-unknown"]);
    expect(results).toEqual([{
      status: "blocked-unknown",
      observation: {
        operationId: "current-unknown-operation",
        outcome: "still-unknown",
      },
    }]);
    expect(screen.getByLabelText("result")).toHaveTextContent("blocked-unknown");
    expect(screen.getByLabelText("safety")).toHaveTextContent("unknown-outcome");
    expect(screen.getByLabelText("location")).toHaveTextContent("/admin/today");
  });

  it("aborts an older deferred navigation and reports obsolete after its settlement", async () => {
    const navigations: Array<{
      href: string;
      signal: AbortSignal;
      gate: ReturnType<typeof deferred<void>>;
    }> = [];
    const committedHrefs: string[] = [];
    const navigateTransition: TransitionNavigation = (href, _options, signal) => {
      const gate = deferred<void>();
      navigations.push({ href, signal, gate });
      return gate.promise.then(() => {
        if (!signal.aborted) committedHrefs.push(href);
      });
    };
    const settled: string[] = [];
    renderController({
      initialEntry: "/clubs/reading-sai/app",
      navigateTransition,
      onSettled: (status) => settled.push(status),
    });

    screen.getByRole("button", { name: "플랫폼으로" }).click();
    await waitFor(() => expect(navigations).toHaveLength(1));
    screen.getByRole("button", { name: "클럽으로" }).click();
    await waitFor(() => expect(navigations).toHaveLength(2));
    navigations[1].gate.resolve();
    await waitFor(() => expect(settled).toEqual(["navigated"]));
    navigations[0].gate.resolve();

    await waitFor(() => expect(settled).toEqual(["navigated", "obsolete"]));
    expect(navigations[0].signal.aborted).toBe(true);
    expect(committedHrefs).toEqual(["/clubs/reading-sai/app"]);
    expect(screen.getByLabelText("result")).toHaveTextContent("navigated");
  });

  it("keeps the newer result when an aborted navigation rejects after the newer navigation settles", async () => {
    const gates: Array<ReturnType<typeof deferred<void>>> = [];
    const signals: AbortSignal[] = [];
    const navigateTransition: TransitionNavigation = (_href, _options, signal) => {
      const gate = deferred<void>();
      gates.push(gate);
      signals.push(signal);
      return gate.promise;
    };
    const settled: string[] = [];
    renderController({
      initialEntry: "/clubs/reading-sai/app",
      navigateTransition,
      onSettled: (status) => settled.push(status),
    });

    screen.getByRole("button", { name: "플랫폼으로" }).click();
    await waitFor(() => expect(gates).toHaveLength(1));
    screen.getByRole("button", { name: "클럽으로" }).click();
    await waitFor(() => expect(gates).toHaveLength(2));
    gates[1].resolve();
    await waitFor(() => expect(settled).toEqual(["navigated"]));
    gates[0].reject(new Error("aborted navigation rejected"));

    await waitFor(() => expect(settled).toEqual(["navigated", "obsolete"]));
    expect(signals[0].aborted).toBe(true);
    expect(screen.getByLabelText("result")).toHaveTextContent("navigated");
  });

  it("uses the refreshed projection to replace a revoked host space with the same-club member space", async () => {
    const latest = authWithSpaces(["CLUBS"]);
    const loadLatestProjection = vi.fn(async () => latest);
    const loadRouteValidation = vi.fn<SpaceRouteValidationLoader>(async () => context());
    renderController({
      initialEntry: "/clubs/reading-sai/app/host/meetings",
      auth: latest,
      loadLatestProjection,
      loadRouteValidation,
    });

    await userEvent.click(screen.getByRole("button", { name: "호스트 권한 회수" }));

    await waitFor(() => expect(screen.getByLabelText("authority-target")).toHaveTextContent(
      /^\/clubs\/reading-sai\/app$/,
    ));
    expect(loadLatestProjection).toHaveBeenCalledTimes(1);
    expect(loadRouteValidation).toHaveBeenCalledWith(member, latest, expect.objectContaining({
      pathname: "/clubs/reading-sai/app",
    }), expect.anything());
  });

  it("uses the authenticated safe fallback when authority-loss projection refresh rejects", async () => {
    renderController({
      initialEntry: "/clubs/reading-sai/app/host",
      loadLatestProjection: async () => { throw new Error("projection unavailable"); },
    });

    await userEvent.click(screen.getByRole("button", { name: "호스트 권한 회수" }));

    await waitFor(() => expect(screen.getByLabelText("authority-target")).toHaveTextContent(/^\/app$/));
  });

  it("removes the revoked host identity from the rendered controller projection before async purge", async () => {
    renderController({ auth: authWithSpaces(["CLUBS"], ["MEMBER", "HOST"]) });
    expect(screen.getByLabelText("available-spaces")).toHaveTextContent(
      "reading-sai:member,reading-sai:host",
    );

    await userEvent.click(screen.getByRole("button", { name: "호스트 권한 즉시 무효화" }));

    expect(screen.getByLabelText("available-spaces")).toHaveTextContent("reading-sai:member");
    expect(screen.getByLabelText("available-spaces")).not.toHaveTextContent("reading-sai:host");
  });

  it("tombstones the old host coordinator and accepts registrations in a fresh member epoch", async () => {
    const auth = authWithSpaces(["CLUBS"], ["MEMBER", "HOST"]);
    let port!: TransitionSafetyRegistrationPort;
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const view = render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={["/clubs/reading-sai/app/host"]}>
          <GlobalSpaceTransitionController
            key={globalSpaceTransitionEpochKey("/clubs/reading-sai/app/host", auth)}
            auth={auth}
            loadLatestProjection={async () => auth}
          >
            <Harness onPort={(value) => { port = value; }} />
          </GlobalSpaceTransitionController>
        </MemoryRouter>
      </QueryClientProvider>,
    );
    await userEvent.click(screen.getByRole("button", { name: "호스트 권한 즉시 무효화" }));
    const tombstoned = port.beginPending({
      ownerId: "old-host-owner",
      operationId: "old-operation",
      recovery: {
        kind: "authoritative-history",
        operationId: "old-operation",
        reconcile: async () => ({ operationId: "old-operation", outcome: "still-unknown" }),
      },
    });
    expect(await tombstoned.reconcile()).toEqual({
      operationId: "old-operation",
      outcome: "authority-lost",
    });

    view.rerender(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={["/clubs/reading-sai/app"]}>
          <GlobalSpaceTransitionController
            key={globalSpaceTransitionEpochKey("/clubs/reading-sai/app", auth)}
            auth={auth}
            loadLatestProjection={async () => auth}
          >
            <Harness onPort={(value) => { port = value; }} />
          </GlobalSpaceTransitionController>
        </MemoryRouter>
      </QueryClientProvider>,
    );
    let current!: ReturnType<TransitionSafetyRegistrationPort["beginPending"]>;
    act(() => {
      current = port.beginPending({
        ownerId: "member-owner",
        operationId: "member-operation",
        recovery: {
          kind: "authoritative-history",
          operationId: "member-operation",
          reconcile: async () => ({ operationId: "member-operation", outcome: "still-unknown" }),
        },
      });
    });

    await waitFor(() => expect(screen.getByLabelText("safety")).toHaveTextContent("pending"));
    await act(async () => expect(await current.settle("succeeded")).toBe("accepted"));
  });

  it("removes a normal-unmount recovery handle from the controller index after auto-reconciliation", async () => {
    let port!: TransitionSafetyRegistrationPort;
    const reconcile = vi.fn(async (): Promise<RecoveryObservation> => ({
      operationId: "operation-unmount",
      outcome: "succeeded",
    }));
    renderController({ onPort: (value) => { port = value; } });
    await waitFor(() => expect(port).toBeDefined());
    let handle!: ReturnType<TransitionSafetyRegistrationPort["beginPending"]>;
    act(() => {
      handle = port.beginPending({
        ownerId: "normal-unmount",
        operationId: "operation-unmount",
        recovery: { kind: "authoritative-history", operationId: "operation-unmount", reconcile },
      });
    });
    await waitFor(() => expect(screen.getByLabelText("retained-recoveries")).toHaveTextContent("1"));

    act(() => handle.unregister());

    await waitFor(() => expect(reconcile).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByLabelText("retained-recoveries")).toHaveTextContent("0"));
  });

  it("keeps legacy child routes in one perspective epoch while separating host and member", () => {
    const legacyAuth: AuthMeResponse = {
      ...authWithSpaces([]),
      availableSpaces: undefined,
    };

    expect(globalSpaceTransitionEpochKey("/app", legacyAuth)).toBe(
      globalSpaceTransitionEpochKey("/app/archive", legacyAuth),
    );
    expect(globalSpaceTransitionEpochKey("/app/host", legacyAuth)).not.toBe(
      globalSpaceTransitionEpochKey("/app", legacyAuth),
    );
  });
});
