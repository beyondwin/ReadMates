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
  platformAdminOperationCasePagesQuery,
  platformAdminOperationCasesQuery,
} from "@/features/platform-admin/queries/platform-admin-operations-queries";
import { findUnnamedInteractiveElements } from "@/shared/testing/accessibility-checks";
import { AdminTodayRoute } from "./admin-today-route";

const operationsApi = vi.hoisted(() => ({
  fetchList: vi.fn(),
  acknowledge: vi.fn(),
  snooze: vi.fn(),
  resolve: vi.fn(),
  fetchDetail: vi.fn(),
}));

vi.mock("@/features/platform-admin/api/platform-admin-operations-api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/platform-admin/api/platform-admin-operations-api")>()),
  fetchAdminOperationCases: operationsApi.fetchList,
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
  client.setQueryData(platformAdminOperationCasePagesQuery().queryKey, {
    pages: [listResponse(items)],
    pageParams: [null],
  });
  client.setQueryData(platformAdminOperationCasePagesQuery({ states: ["OPEN"] }).queryKey, {
    pages: [listResponse(items)],
    pageParams: [null],
  });
  for (const item of items) {
    client.setQueryData(platformAdminOperationCaseQuery(item.id).queryKey, detailResponse(item));
  }
  return client;
}

function freshClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Number.POSITIVE_INFINITY } },
  });
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
  operationsApi.fetchList.mockResolvedValue(listResponse());
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

  it("never lets an older detail version overwrite a newer polled list lifecycle", async () => {
    const user = userEvent.setup();
    const currentListCase = operationCase({
      state: "ACKNOWLEDGED",
      version: 5,
      allowedActions: ["SNOOZE", "RESOLVE"],
    });
    const staleDetailCase = operationCase({ state: "OPEN", version: 4 });
    operationsApi.acknowledge.mockResolvedValue({
      schema: "admin.operation_cases.v1",
      ...currentListCase,
      state: "ACKNOWLEDGED",
      version: 6,
    });
    const client = seededClient([currentListCase]);
    client.setQueryData(
      platformAdminOperationCaseQuery(currentListCase.id).queryKey,
      detailResponse(staleDetailCase),
    );

    renderRoute(client, "/admin/today?case=case-notification");

    expect(await screen.findAllByText("현재 상태 · 확인됨")).toHaveLength(2);
    expect(screen.queryByRole("button", { name: "확인 처리" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "4시간 보류", exact: true }));

    await waitFor(() => {
      expect(operationsApi.snooze).toHaveBeenCalledWith(
        "case-notification",
        5,
        expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
      );
    });
  });

  it("loads cursor continuations into one queue while preserving filters and selection", async () => {
    const user = userEvent.setup();
    const first = operationCase({ id: "case-first", severity: "CRITICAL" });
    const second = operationCase({ id: "case-second", severity: "WARNING" });
    operationsApi.fetchList.mockImplementation(async (filter: { cursor?: string }) => {
      if (filter.cursor === "cursor-page-2") return listResponse([second]);
      return { ...listResponse([first]), nextCursor: "cursor-page-2" };
    });
    const client = freshClient();

    renderRoute(client, "/admin/today?case=case-first&state=open&source=notification");

    expect(await screen.findByRole("button", { name: /case-first|알림 전달 실패/ })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await user.click(screen.getByRole("button", { name: "운영 케이스 더 보기" }));

    expect(await screen.findAllByRole("button", { name: /알림 전달 실패/ })).toHaveLength(2);
    expect(screen.queryByRole("button", { name: "운영 케이스 더 보기" })).not.toBeInTheDocument();
    expect(operationsApi.fetchList).toHaveBeenNthCalledWith(1, {
      states: ["OPEN"],
      sources: ["NOTIFICATION"],
    });
    expect(operationsApi.fetchList).toHaveBeenNthCalledWith(2, {
      states: ["OPEN"],
      sources: ["NOTIFICATION"],
      cursor: "cursor-page-2",
    });
    expect(screen.getByLabelText("current location")).toHaveTextContent(
      "/admin/today?case=case-first&state=open&source=notification",
    );
    expect(screen.getByRole("button", { name: /알림 전달 실패/, pressed: true })).toBeInTheDocument();
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

  it("retries an unavailable source through the list query without running a lifecycle mutation", async () => {
    const user = userEvent.setup();
    const unavailable = {
      ...operationCase().source,
      sourceType: "AI_JOB" as const,
      status: "UNAVAILABLE" as const,
      lastSuccessfulAt: "2026-08-04T09:20:00Z",
      authoritative: false,
    };
    const response = { ...listResponse(), sources: [operationCase().source, unavailable] };
    const client = seededClient();
    client.setQueryData(platformAdminOperationCasesQuery().queryKey, response);
    client.setQueryData(platformAdminOperationCasePagesQuery().queryKey, {
      pages: [response],
      pageParams: [null],
    });
    operationsApi.fetchList.mockResolvedValue(response);
    renderRoute(client, "/admin/today?case=case-notification");

    await user.click(await screen.findByRole("button", { name: "AI 작업 다시 확인" }));

    await waitFor(() => expect(operationsApi.fetchList).toHaveBeenCalledTimes(1));
    expect(operationsApi.acknowledge).not.toHaveBeenCalled();
    expect(operationsApi.snooze).not.toHaveBeenCalled();
    expect(operationsApi.resolve).not.toHaveBeenCalled();
  });

  it("replaces the command surface with a safe alert when list access is denied", async () => {
    operationsApi.fetchList.mockRejectedValue(
      Object.assign(new Error("forbidden"), { status: 403, code: "FORBIDDEN" }),
    );
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    renderRoute(client);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "현재 역할로 운영 케이스를 확인할 수 없습니다. 권한을 확인해 주세요.",
    );
    expect(screen.queryByRole("region", { name: "운영 케이스 큐" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "확인 처리" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "해결 확인" })).not.toBeInTheDocument();
  });

  it("removes stale lifecycle actions when a mutation is denied", async () => {
    const user = userEvent.setup();
    operationsApi.acknowledge.mockRejectedValue(
      Object.assign(new Error("forbidden"), { status: 403, code: "FORBIDDEN" }),
    );
    renderRoute(seededClient(), "/admin/today?case=case-notification");

    await user.click(await screen.findByRole("button", { name: "확인 처리" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "상태 변경 권한이 더 이상 유효하지 않습니다. 새로고침 후 권한을 확인해 주세요.",
    );
    expect(screen.queryByRole("button", { name: "확인 처리" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "해결 확인" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /알림 전달 실패/ }));

    expect(screen.getByRole("alert")).toHaveTextContent(
      "상태 변경 권한이 더 이상 유효하지 않습니다. 새로고침 후 권한을 확인해 주세요.",
    );
    expect(screen.queryByRole("button", { name: "확인 처리" })).not.toBeInTheDocument();
  });
});
