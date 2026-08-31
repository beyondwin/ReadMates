import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, useLocation, useNavigate } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  AdminOperationCase,
  AdminOperationCaseDetailResponse,
  AdminOperationCasesResponse,
} from "@/features/platform-admin/api/platform-admin-operations-contracts";
import type { PlatformAdminCapabilities } from "@/features/platform-admin/model/platform-admin-capabilities";
import {
  platformAdminCapabilitiesQuery,
  purgePlatformAdminState,
} from "@/features/platform-admin/queries/platform-admin-queries";
import {
  platformAdminOperationCasePagesQuery,
  platformAdminOperationCaseQuery,
} from "@/features/platform-admin/queries/platform-admin-operations-queries";
import { createGlobalSpaceTransitionCoordinator } from "@/src/app/global-space-transition";
import { ReadmatesTransportError } from "@/shared/api/errors";
import { SpaceTransitionSafetyProvider } from "@/shared/ui/space-transition-safety-context";
import { useAdminTodayController } from "./use-admin-today-controller";

const operationsApi = vi.hoisted(() => ({
  fetchList: vi.fn(),
  fetchDetail: vi.fn(),
  acknowledge: vi.fn(),
  snooze: vi.fn(),
  resolve: vi.fn(),
}));

vi.mock("@/features/platform-admin/api/platform-admin-operations-api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/platform-admin/api/platform-admin-operations-api")>()),
  fetchAdminOperationCases: operationsApi.fetchList,
  fetchAdminOperationCase: operationsApi.fetchDetail,
  acknowledgeAdminOperationCase: operationsApi.acknowledge,
  snoozeAdminOperationCase: operationsApi.snooze,
  resolveAdminOperationCase: operationsApi.resolve,
}));

vi.mock("@/features/platform-admin/api/platform-admin-capabilities-api", () => ({
  fetchPlatformAdminCapabilities: vi.fn(),
}));

import { fetchPlatformAdminCapabilities } from "@/features/platform-admin/api/platform-admin-capabilities-api";

const ownerCapabilities: PlatformAdminCapabilities = {
  schemaVersion: 1,
  role: "OWNER",
  status: "ACTIVE",
  capabilities: ["VIEW_TODAY"],
  generatedAt: "2026-08-22T00:00:00Z",
};

function operationCase(
  id: string,
  overrides: Partial<AdminOperationCase> = {},
): AdminOperationCase {
  const sourceType = overrides.sourceType ?? "NOTIFICATION";
  return {
    id,
    sourceType,
    clubId: null,
    state: "OPEN",
    severity: "WARNING",
    summaryCode: "NOTIFICATION_DELIVERY_FAILURE",
    firstObservedAt: "2026-08-04T08:00:00Z",
    lastObservedAt: "2026-08-04T09:55:00Z",
    snoozedUntil: null,
    resolvedAt: null,
    assignedToMe: true,
    reopenCount: 0,
    version: 3,
    impactCount: 2,
    detailHref: "/admin/notifications?focus=delivery",
    allowedActions: ["ACKNOWLEDGE", "SNOOZE", "RESOLVE"],
    source: {
      sourceType,
      status: "AVAILABLE",
      generatedAt: "2026-08-04T10:00:00Z",
      lastSuccessfulAt: "2026-08-04T10:00:00Z",
      authoritative: true,
    },
    ...overrides,
  };
}

function listResponse(
  items: AdminOperationCase[],
  generatedAt = "2026-08-04T10:00:00Z",
): AdminOperationCasesResponse {
  return {
    schema: "admin.operation_cases.v1",
    generatedAt,
    counts: {
      open: items.filter((item) => item.state !== "RESOLVED").length,
      critical: items.filter((item) => item.severity === "CRITICAL").length,
      assignedToMe: items.filter((item) => item.assignedToMe).length,
      snoozed: items.filter((item) => item.state === "SNOOZED").length,
    },
    sources: items[0] ? [items[0].source] : [],
    items,
    nextCursor: null,
  };
}

function detailResponse(item: AdminOperationCase): AdminOperationCaseDetailResponse {
  return { schema: "admin.operation_cases.v1", item, history: [] };
}

function seededClient(items: AdminOperationCase[]) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Number.POSITIVE_INFINITY } },
  });
  client.setQueryData(platformAdminCapabilitiesQuery().queryKey, ownerCapabilities);
  client.setQueryData(platformAdminOperationCasePagesQuery({
    states: ["OPEN", "ACKNOWLEDGED"],
  }).queryKey, {
    pages: [listResponse(items)],
    pageParams: [null],
  });
  for (const item of items) {
    client.setQueryData(platformAdminOperationCaseQuery(item.id).queryKey, detailResponse(item));
  }
  return client;
}

function Probe() {
  const controller = useAdminTodayController();
  const location = useLocation();
  const navigate = useNavigate();
  return (
    <div>
      <output aria-label="status">{controller.status}</output>
      <output aria-label="location">{location.pathname}{location.search}</output>
      <output aria-label="selection">{controller.view?.selectedCaseId ?? "none"}</output>
      <output aria-label="rows">{controller.view?.items.map((item) => item.id).join(",") ?? ""}</output>
      <output aria-label="pending-new">{controller.pendingCount}</output>
      <output aria-label="action-state">{controller.actionState}</output>
      <output aria-label="mutation-target">{controller.mutationTarget?.caseId ?? "none"}</output>
      <button type="button" onClick={() => controller.selectCase("case-b")}>select-b</button>
      <button type="button" onClick={() => navigate(-1)}>back</button>
      <button type="button" onClick={controller.acceptPending}>apply-pending</button>
      <button type="button" onClick={() => void controller.acknowledgeCurrent()}>ack</button>
    </div>
  );
}

function renderController(client: QueryClient, initialEntry: string) {
  const coordinator = createGlobalSpaceTransitionCoordinator();
  const rendered = render(
    <QueryClientProvider client={client}>
      <SpaceTransitionSafetyProvider port={coordinator}>
        <MemoryRouter initialEntries={[initialEntry]}>
          <Probe />
        </MemoryRouter>
      </SpaceTransitionSafetyProvider>
    </QueryClientProvider>,
  );
  return { ...rendered, coordinator };
}

beforeEach(() => {
  vi.clearAllMocks();
  const item = operationCase("case-a");
  operationsApi.fetchList.mockResolvedValue(listResponse([item]));
  operationsApi.fetchDetail.mockResolvedValue(detailResponse(item));
  vi.mocked(fetchPlatformAdminCapabilities).mockResolvedValue(ownerCapabilities);
});

describe("useAdminTodayController", () => {
  it("keeps URL selection authoritative across selection and browser Back", async () => {
    const user = userEvent.setup();
    const items = [operationCase("case-a"), operationCase("case-b")];
    renderController(seededClient(items), "/admin/today?case=case-a");

    expect(await screen.findByLabelText("selection")).toHaveTextContent("case-a");
    await user.click(screen.getByRole("button", { name: "select-b" }));
    await waitFor(() => {
      expect(screen.getByLabelText("location")).toHaveTextContent("case=case-b");
      expect(screen.getByLabelText("selection")).toHaveTextContent("case-b");
    });

    await user.click(screen.getByRole("button", { name: "back" }));
    await waitFor(() => {
      expect(screen.getByLabelText("location")).toHaveTextContent("case=case-a");
      expect(screen.getByLabelText("selection")).toHaveTextContent("case-a");
    });
  });

  it("holds polled rows until acceptance and then applies them without duplication", async () => {
    const user = userEvent.setup();
    const first = operationCase("case-a");
    const client = seededClient([first]);
    renderController(client, "/admin/today?case=case-a");
    expect(await screen.findByLabelText("rows")).toHaveTextContent("case-a");

    const critical = operationCase("case-new", { severity: "CRITICAL" });
    act(() => {
      client.setQueryData(platformAdminOperationCasePagesQuery({
        states: ["OPEN", "ACKNOWLEDGED"],
      }).queryKey, {
        pages: [listResponse([critical, { ...first, version: 4 }], "2026-08-04T10:15:00Z")],
        pageParams: [null],
      });
    });

    await waitFor(() => expect(screen.getByLabelText("pending-new")).toHaveTextContent("1"));
    expect(screen.getByLabelText("rows")).toHaveTextContent("case-a");
    await user.click(screen.getByRole("button", { name: "apply-pending" }));
    await waitFor(() => expect(screen.getByLabelText("rows")).toHaveTextContent("case-new,case-a"));
    expect(screen.getByLabelText("pending-new")).toHaveTextContent("0");
  });

  it("makes a late obsolete mutation publish no cache or UI result", async () => {
    const user = userEvent.setup();
    let release!: () => void;
    operationsApi.acknowledge.mockImplementation(() => new Promise((resolve) => {
      release = () => resolve({
        schema: "admin.operation_cases.v1",
        ...operationCase("case-a", { state: "ACKNOWLEDGED", version: 4 }),
      });
    }));
    const client = seededClient([operationCase("case-a")]);
    const invalidate = vi.spyOn(client, "invalidateQueries");
    const rendered = renderController(client, "/admin/today?case=case-a");

    await user.click(await screen.findByRole("button", { name: "ack" }));
    expect(screen.getByLabelText("action-state")).toHaveTextContent("pending");
    rendered.unmount();
    await act(async () => release());

    expect(operationsApi.acknowledge).toHaveBeenCalledTimes(1);
    expect(invalidate).not.toHaveBeenCalled();
    expect(rendered.coordinator.getSnapshot()).toEqual({ kind: "clean" });
  });

  it("clears pending state on authority loss before a late response and never retries", async () => {
    const user = userEvent.setup();
    let release!: () => void;
    operationsApi.acknowledge.mockImplementation(() => new Promise((resolve) => {
      release = () => resolve({
        schema: "admin.operation_cases.v1",
        ...operationCase("case-a", { state: "ACKNOWLEDGED", version: 4 }),
      });
    }));
    const client = seededClient([operationCase("case-a")]);
    const invalidate = vi.spyOn(client, "invalidateQueries");
    renderController(client, "/admin/today?case=case-a");

    await user.click(await screen.findByRole("button", { name: "ack" }));
    expect(screen.getByLabelText("mutation-target")).toHaveTextContent("case-a");
    act(() => purgePlatformAdminState(client));

    expect(await screen.findByLabelText("status")).toHaveTextContent("forbidden");
    expect(screen.getByLabelText("mutation-target")).toHaveTextContent("none");
    await act(async () => release());
    expect(operationsApi.acknowledge).toHaveBeenCalledTimes(1);
    expect(invalidate).not.toHaveBeenCalled();
  });

  it("keeps response loss unknown, reconciles reads, and performs zero blind retry", async () => {
    const user = userEvent.setup();
    operationsApi.acknowledge.mockRejectedValue(new ReadmatesTransportError());
    const client = seededClient([operationCase("case-a")]);
    renderController(client, "/admin/today?case=case-a");

    await user.click(await screen.findByRole("button", { name: "ack" }));
    await waitFor(() => {
      expect(screen.getByLabelText("action-state")).toHaveTextContent("unknown-outcome");
    });
    expect(operationsApi.fetchList).toHaveBeenCalled();
    expect(operationsApi.fetchDetail).toHaveBeenCalledWith("case-a");
    expect(operationsApi.acknowledge).toHaveBeenCalledTimes(1);
  });
});
