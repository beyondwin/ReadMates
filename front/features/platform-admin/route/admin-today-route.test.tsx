import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, useLocation, useNavigate } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  AdminOperationCase,
  AdminOperationCaseDetailResponse,
  AdminOperationCasesResponse,
} from "@/features/platform-admin/api/platform-admin-operations-contracts";
import {
  adminOperationsKeys,
  platformAdminOperationCaseQuery,
  platformAdminOperationCasesQuery,
} from "@/features/platform-admin/queries/platform-admin-operations-queries";
import { findUnnamedInteractiveElements } from "@/shared/testing/accessibility-checks";
import { AdminTodayRoute } from "./admin-today-route";

const operationsApi = vi.hoisted(() => ({
  acknowledge: vi.fn(),
  snooze: vi.fn(),
  resolve: vi.fn(),
  fetchDetail: vi.fn(),
}));

vi.mock("@/features/platform-admin/api/platform-admin-operations-api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/platform-admin/api/platform-admin-operations-api")>()),
  acknowledgeAdminOperationCase: operationsApi.acknowledge,
  snoozeAdminOperationCase: operationsApi.snooze,
  resolveAdminOperationCase: operationsApi.resolve,
  fetchAdminOperationCase: operationsApi.fetchDetail,
}));

const generatedAt = "2026-08-04T10:00:00Z";

function operationCase(overrides: Partial<AdminOperationCase> = {}): AdminOperationCase {
  const sourceType = overrides.sourceType ?? "NOTIFICATION";
  return {
    id: "case-notification",
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
      generatedAt,
      lastSuccessfulAt: generatedAt,
      authoritative: true,
    },
    ...overrides,
  };
}

function listResponse(items = [operationCase()]): AdminOperationCasesResponse {
  return {
    schema: "admin.operation_cases.v1",
    generatedAt,
    counts: { open: items.filter((item) => item.state !== "RESOLVED").length, critical: 0, assignedToMe: 1, snoozed: 0 },
    sources: [operationCase().source],
    items,
    nextCursor: null,
  };
}

function detailResponse(item = operationCase()): AdminOperationCaseDetailResponse {
  return {
    schema: "admin.operation_cases.v1",
    item,
    history: [{
      fromState: null,
      toState: "OPEN",
      action: null,
      reasonCode: "SIGNAL_OPENED",
      occurredAt: "2026-08-04T08:00:00Z",
      caseVersion: 1,
    }],
  };
}

function seededClient(items = [operationCase()]) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Number.POSITIVE_INFINITY } },
  });
  client.setQueryData(platformAdminOperationCasesQuery().queryKey, listResponse(items));
  client.setQueryData(platformAdminOperationCasesQuery({ states: ["OPEN"] }).queryKey, listResponse(items));
  for (const item of items) {
    client.setQueryData(platformAdminOperationCaseQuery(item.id).queryKey, detailResponse(item));
  }
  return client;
}

function LocationProbe() {
  const location = useLocation();
  const navigate = useNavigate();
  return (
    <>
      <output aria-label="current location">{location.pathname}{location.search}</output>
      <button type="button" onClick={() => navigate(-1)}>뒤로</button>
    </>
  );
}

function renderRoute(client: QueryClient, initialEntry = "/admin/today") {
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <AdminTodayRoute />
        <LocationProbe />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  operationsApi.fetchDetail.mockResolvedValue(detailResponse());
});

describe("AdminTodayRoute", () => {
  it("restores a seeded case selection and renders the queue and inspector", async () => {
    const { container } = renderRoute(seededClient(), "/admin/today?case=case-notification");

    expect(await screen.findByRole("heading", { name: "오늘의 운영 케이스" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "운영 케이스 큐" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "운영 케이스 상세" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /알림 전달 실패가 반복되고 있습니다/ })).toHaveAttribute("aria-pressed", "true");
    expect(findUnnamedInteractiveElements(container)).toEqual([]);
  });

  it("preserves a visible selected case when a filter changes", async () => {
    const user = userEvent.setup();
    renderRoute(seededClient(), "/admin/today?case=case-notification");

    await user.selectOptions(await screen.findByRole("combobox", { name: "상태 필터" }), "open");

    await waitFor(() => {
      expect(screen.getByLabelText("current location")).toHaveTextContent(
        "/admin/today?case=case-notification&state=open",
      );
    });
    expect(screen.getByRole("button", { name: /알림 전달 실패가 반복되고 있습니다/ })).toHaveAttribute("aria-pressed", "true");
  });

  it("does not expose lifecycle mutation buttons to support", async () => {
    renderRoute(
      seededClient([operationCase({ allowedActions: [] })]),
      "/admin/today?case=case-notification",
    );

    expect(await screen.findByText("현재 역할은 상태 변경 없이 운영 근거만 확인할 수 있습니다.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "확인 처리" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "해결 확인" })).not.toBeInTheDocument();
  });

  it("recovers from a 409 by announcing refresh-required copy and refetching detail", async () => {
    const user = userEvent.setup();
    operationsApi.acknowledge.mockRejectedValue(
      Object.assign(new Error("다른 운영자가 먼저 상태를 변경했습니다."), {
        status: 409,
        code: "CASE_VERSION_CONFLICT",
      }),
    );
    const client = seededClient();
    renderRoute(client, "/admin/today?case=case-notification");

    await user.click(await screen.findByRole("button", { name: "확인 처리" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "최신 상태를 다시 불러왔습니다. 내용을 확인한 뒤 다시 시도해 주세요.",
    );
    await waitFor(() => expect(operationsApi.fetchDetail).toHaveBeenCalledWith("case-notification"));
    expect(client.getQueryState(adminOperationsKeys.detail("case-notification"))?.fetchStatus).toBe("idle");
  });

  it("explains an active signal without mislabeling it as a version conflict", async () => {
    const user = userEvent.setup();
    operationsApi.resolve.mockRejectedValue(
      Object.assign(new Error("현재 신호가 여전히 활성 상태입니다."), {
        status: 409,
        code: "CASE_STILL_ACTIVE",
      }),
    );
    renderRoute(seededClient(), "/admin/today?case=case-notification");

    await user.click(await screen.findByRole("button", { name: "해결 확인" }));
    await user.click(screen.getByRole("button", { name: "신호 재검증 후 해결" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "신호가 아직 활성 상태입니다. 운영 상세에서 원인을 해소한 뒤 다시 확인해 주세요.",
    );
    expect(operationsApi.fetchDetail).not.toHaveBeenCalled();
  });

  it("restores user-selected filters through browser history", async () => {
    const user = userEvent.setup();
    renderRoute(seededClient(), "/admin/today?case=case-notification");

    const filter = await screen.findByRole("combobox", { name: "상태 필터" });
    await user.selectOptions(filter, "open");
    await waitFor(() => expect(filter).toHaveValue("open"));

    await user.click(screen.getByRole("button", { name: "뒤로" }));

    await waitFor(() => {
      expect(screen.getByLabelText("current location")).toHaveTextContent(
        "/admin/today?case=case-notification",
      );
      expect(filter).toHaveValue("");
    });
  });
});
