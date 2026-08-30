import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SpaceTransitionSafetyProvider } from "@/shared/ui/space-transition-safety-context";
import type { TransitionPublicationSurface } from "@/shared/model/global-space";
import {
  createGlobalSpaceTransitionCoordinator,
  createRetiredReceiptCapsuleRegistry,
} from "@/src/app/global-space-transition";
import previewFixture from "../../../tests/unit/__fixtures__/platform-admin-takedown-preview.server.json";
import receiptFixture from "../../../tests/unit/__fixtures__/platform-admin-takedown-receipt.server.json";
import {
  parseAdminTakedownPreview,
  parseAdminTakedownReceipt,
  type ConfirmTakedownRequest,
} from "../api/platform-admin-takedown-contracts";
import type { PlatformAdminCapability } from "../model/platform-admin-capabilities";
import {
  adminTakedownKeys,
} from "../queries/platform-admin-takedown-queries";
import {
  platformAdminCapabilitiesQuery,
  platformAdminSummaryQuery,
} from "../queries/platform-admin-queries";
import { createAdminTakedownReceiptCapsule } from "./admin-public-takedown-receipt-capsule";

vi.mock("@/features/platform-admin/api/platform-admin-takedown-api", () => ({
  confirmAdminPublicTakedown: vi.fn(),
  previewAdminPublicTakedown: vi.fn(),
}));

import {
  confirmAdminPublicTakedown,
  previewAdminPublicTakedown,
} from "../api/platform-admin-takedown-api";
import { AdminPublicTakedownRoute } from "./admin-public-takedown-route";

const blockedPreview = parseAdminTakedownPreview(previewFixture);
const enabledPreview = { ...blockedPreview, confirmEnabled: true, activationBoundary: "ACTIVE" };
const receipt = parseAdminTakedownReceipt(receiptFixture);
const capabilities: PlatformAdminCapability[] = ["VIEW_TODAY", "VIEW_CLUBS", "EMERGENCY_PUBLIC_TAKEDOWN"];

const summary = {
  platformRole: "OPERATOR" as const,
  activeClubCount: 1,
  domainActionRequiredCount: 0,
  domains: [],
  domainsRequiringAction: [],
};

function renderRoute(granted = true) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity }, mutations: { retry: false } },
  });
  queryClient.setQueryData(platformAdminSummaryQuery().queryKey, summary);
  queryClient.setQueryData(platformAdminCapabilitiesQuery().queryKey, {
    schemaVersion: 1,
    role: granted ? "OPERATOR" : "SUPPORT",
    status: "ACTIVE",
    capabilities: granted ? capabilities : ["VIEW_TODAY", "VIEW_CLUBS"],
    generatedAt: "2026-08-30T04:00:00Z",
  });
  const coordinator = createGlobalSpaceTransitionCoordinator();
  return {
    queryClient,
    coordinator,
    ...render(
      <QueryClientProvider client={queryClient}>
        <SpaceTransitionSafetyProvider port={coordinator}>
          <MemoryRouter initialEntries={["/admin/public-takedown"]}>
            <AdminPublicTakedownRoute />
          </MemoryRouter>
        </SpaceTransitionSafetyProvider>
      </QueryClientProvider>,
    ),
  };
}

async function previewTarget() {
  fireEvent.change(screen.getByLabelText("클럽 ID"), { target: { value: blockedPreview.clubId } });
  fireEvent.change(screen.getByLabelText("모임 ID"), { target: { value: blockedPreview.sessionId } });
  fireEvent.change(screen.getByLabelText("공개 기록 ID"), { target: { value: blockedPreview.publicationId } });
  fireEvent.click(screen.getByRole("button", { name: "대상 확인" }));
  await screen.findByText("회수 대상을 마지막으로 확인하세요");
}

beforeEach(() => {
  vi.clearAllMocks();
  sessionStorage.clear();
});

describe("AdminPublicTakedownRoute", () => {
  it("fails closed without the emergency capability", () => {
    renderRoute(false);
    expect(screen.getByText("긴급 회수 권한이 없습니다.")).toBeInTheDocument();
    expect(screen.queryByLabelText("클럽 ID")).not.toBeInTheDocument();
    expect(confirmAdminPublicTakedown).not.toHaveBeenCalled();
  });

  it("registers preview pending and renders the exact server-shaped target", async () => {
    vi.mocked(previewAdminPublicTakedown).mockResolvedValue(blockedPreview);
    const { coordinator } = renderRoute();
    fireEvent.change(screen.getByLabelText("클럽 ID"), { target: { value: blockedPreview.clubId } });
    fireEvent.change(screen.getByLabelText("모임 ID"), { target: { value: blockedPreview.sessionId } });
    fireEvent.change(screen.getByLabelText("공개 기록 ID"), { target: { value: blockedPreview.publicationId } });
    fireEvent.click(screen.getByRole("button", { name: "대상 확인" }));
    expect(coordinator.getSnapshot().kind).toBe("pending");
    await screen.findByText("회수 대상을 마지막으로 확인하세요");
    expect(coordinator.getSnapshot()).toEqual({ kind: "clean" });
    expect(screen.getByRole("button", { name: "긴급 회수 확인" })).toBeDisabled();
  });

  it("sends one confirm and publishes only accepted cache and UI surfaces", async () => {
    vi.mocked(previewAdminPublicTakedown).mockResolvedValue(enabledPreview);
    vi.mocked(confirmAdminPublicTakedown).mockResolvedValue(receipt);
    const storageWrite = vi.spyOn(Storage.prototype, "setItem");
    const { queryClient } = renderRoute();
    await previewTarget();
    fireEvent.change(screen.getByLabelText("회수 사유"), { target: { value: "공개 기록 개인정보 회수" } });
    fireEvent.click(screen.getByRole("button", { name: "긴급 회수 확인" }));

    expect(await screen.findByRole("region", { name: "변경 불가 회수 영수증" })).toHaveTextContent(receipt.receiptId);
    expect(confirmAdminPublicTakedown).toHaveBeenCalledTimes(1);
    expect(confirmAdminPublicTakedown).toHaveBeenCalledWith(expect.objectContaining({
      previewId: enabledPreview.previewId,
      reasonCategory: "PRIVATE_DATA",
      reason: "공개 기록 개인정보 회수",
    }));
    expect(queryClient.getQueryData(adminTakedownKeys.receipt(receipt.receiptId))).toEqual(receipt);
    expect(storageWrite).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: /전파.*시도/ })).not.toBeInTheDocument();
    storageWrite.mockRestore();
  });

  it("proves beginPending -> unregister -> authority loss -> late settlement has zero replay/publication", async () => {
    const registry = createRetiredReceiptCapsuleRegistry();
    const coordinator = createGlobalSpaceTransitionCoordinator({ registry });
    const original = deferred<typeof receipt>();
    const request: ConfirmTakedownRequest = {
      previewId: enabledPreview.previewId,
      reasonCategory: "PRIVATE_DATA",
      reason: "byte-identical reason",
      idempotencyKey: "takedown-original-identity-0001",
    };
    const requestSpy = vi.fn(() => original.promise);
    const originalRequest = requestSpy(request);
    const capsule = createAdminTakedownReceiptCapsule({ request, replayLookup: requestSpy });
    const handle = coordinator.beginPending({
      ownerId: "platform-admin-public-takedown",
      operationId: request.idempotencyKey,
      recovery: { kind: "receipt", capsule },
    });
    handle.unregister();
    coordinator.invalidateForAuthorityLoss();
    original.resolve(receipt);
    await originalRequest;
    expect(await handle.settle("succeeded")).toBe("obsolete");
    expect(await handle.reconcile()).toEqual({ operationId: request.idempotencyKey, outcome: "authority-lost" });

    const surfaces: TransitionPublicationSurface[] = [
      "cache", "ui", "receiptCallback", "successCopy", "errorCopy", "navigation", "returnTarget", "sessionStorage",
    ];
    const publications = surfaces.map(() => vi.fn());
    expect(surfaces.map((surface, index) => handle.publishAccepted({ surface, publish: publications[index]! })))
      .toEqual(surfaces.map(() => "rejected"));
    expect(requestSpy).toHaveBeenCalledTimes(1);
    expect(capsule.replayCount()).toBe(0);
    expect(publications.every((publish) => publish.mock.calls.length === 0)).toBe(true);
    expect(capsule.retainedRequest()).toBeNull();
    expect(registry.size()).toBe(0);
  });

  it("normal unmount performs one same-identity detached lookup and clears the capsule", async () => {
    const registry = createRetiredReceiptCapsuleRegistry();
    const coordinator = createGlobalSpaceTransitionCoordinator({ registry });
    const request: ConfirmTakedownRequest = {
      previewId: enabledPreview.previewId,
      reasonCategory: "LEGAL_REQUEST",
      reason: "same bytes",
      idempotencyKey: "takedown-original-identity-0002",
    };
    const replayLookup = vi.fn().mockResolvedValue(receipt);
    const capsule = createAdminTakedownReceiptCapsule({ request, replayLookup });
    const handle = coordinator.beginPending({
      ownerId: "platform-admin-public-takedown",
      operationId: request.idempotencyKey,
      recovery: { kind: "receipt", capsule },
    });
    handle.unregister();

    expect(await handle.reconcile()).toEqual({ operationId: request.idempotencyKey, outcome: "succeeded" });
    expect(replayLookup).toHaveBeenCalledTimes(1);
    expect(replayLookup).toHaveBeenCalledWith(request);
    expect(capsule.replayCount()).toBe(1);
    expect(capsule.retainedRequest()).toBeNull();
    await waitFor(() => expect(registry.size()).toBe(0));
  });
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => { resolve = next; });
  return { promise, resolve };
}
