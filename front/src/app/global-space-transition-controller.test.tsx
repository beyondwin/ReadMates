import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useEffect, useState } from "react";
import { MemoryRouter, useLocation } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AuthMeResponse } from "@/shared/auth/auth-contracts";
import type {
  RecoveryObservation,
  SpaceIdentity,
  TransitionSafetyRegistrationPort,
} from "@/shared/model/global-space";
import { globalSpaceReturnTargetStorageKey } from "./global-space-continuity";
import {
  GlobalSpaceTransitionController,
  globalSpaceTransitionEpochKey,
  useGlobalSpaceTransitionController,
  type LatestSpaceProjectionLoader,
  type SpaceRouteValidationLoader,
} from "./global-space-transition-controller";

const platform: SpaceIdentity = { productSpace: "platform" };
const member: SpaceIdentity = {
  productSpace: "clubs",
  clubId: "club-1",
  clubSlug: "reading-sai",
  perspective: "member",
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

function Harness({ onPort }: { onPort?: (port: TransitionSafetyRegistrationPort) => void }) {
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
      <button
        type="button"
        onClick={() => void controller.requestTransition(platform).then((next) => setResult(next.status))}
      >
        플랫폼으로
      </button>
      <button
        type="button"
        onClick={() => void controller.requestTransition(member).then((next) => setResult(next.status))}
      >
        클럽으로
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
} = {}) {
  const controllerAuth = input.auth ?? authWithSpaces(["PLATFORM", "CLUBS"]);
  return render(
    <MemoryRouter initialEntries={[input.initialEntry ?? "/admin/today"]}>
      <GlobalSpaceTransitionController
        auth={controllerAuth}
        loadLatestProjection={input.loadLatestProjection ?? (async () => controllerAuth)}
        loadRouteValidation={input.loadRouteValidation}
        confirmDirtyLeave={input.confirmDirtyLeave}
      >
        <Harness onPort={input.onPort} />
      </GlobalSpaceTransitionController>
    </MemoryRouter>,
  );
}

afterEach(() => {
  vi.useRealTimers();
  window.sessionStorage.clear();
  vi.restoreAllMocks();
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
    expect(loadRouteValidation).toHaveBeenCalledWith(platform, latest);
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
    expect(loadRouteValidation).toHaveBeenCalledWith(member, latest);
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
    const view = render(
      <MemoryRouter initialEntries={["/clubs/reading-sai/app/host"]}>
        <GlobalSpaceTransitionController
          key={globalSpaceTransitionEpochKey("/clubs/reading-sai/app/host", auth)}
          auth={auth}
          loadLatestProjection={async () => auth}
        >
          <Harness onPort={(value) => { port = value; }} />
        </GlobalSpaceTransitionController>
      </MemoryRouter>,
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
      <MemoryRouter initialEntries={["/clubs/reading-sai/app"]}>
        <GlobalSpaceTransitionController
          key={globalSpaceTransitionEpochKey("/clubs/reading-sai/app", auth)}
          auth={auth}
          loadLatestProjection={async () => auth}
        >
          <Harness onPort={(value) => { port = value; }} />
        </GlobalSpaceTransitionController>
      </MemoryRouter>,
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
