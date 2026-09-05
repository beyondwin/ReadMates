import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ReadmatesTransportError } from "@/shared/api/errors";
import type {
  AdminOperationCase,
  AdminOperationCaseDetailResponse,
  AdminOperationCaseFilter,
  AdminOperationCasesResponse,
} from "@/features/platform-admin/api/platform-admin-operations-contracts";
import type { PlatformAdminCapabilities } from "@/features/platform-admin/model/platform-admin-capabilities";
import {
  installPlatformAdminAuthorityLossHandler,
  platformAdminCapabilitiesQuery,
  platformAdminKeys,
} from "@/features/platform-admin/queries/platform-admin-queries";
import {
  adminOperationsKeys,
  platformAdminOperationCaseQuery,
  platformAdminOperationCasePagesQuery,
  platformAdminOperationCasesQuery,
} from "@/features/platform-admin/queries/platform-admin-operations-queries";
import { apiErrorFromResponse } from "@/shared/api/errors";
import { findUnnamedInteractiveElements } from "@/shared/testing/accessibility-checks";
import { APPROVED_TODAY_ACTION_COPY } from "@/features/platform-admin/ui/admin-operation-state-actions";
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

vi.mock("@/features/platform-admin/api/platform-admin-capabilities-api", () => ({
  fetchPlatformAdminCapabilities: vi.fn(),
}));

vi.mock("@/features/platform-admin/route/admin-shell-status-context", () => ({
  useAdminShellStatus: vi.fn(),
}));

import { fetchPlatformAdminCapabilities } from "@/features/platform-admin/api/platform-admin-capabilities-api";
import { useAdminShellStatus } from "./admin-shell-status-context";

const generatedAt = "2026-08-04T10:00:00Z";
const memberQueryKey = ["current-session", "me"] as const;
const memberSnapshot = { userId: "member-1" };

const ownerCapabilities: PlatformAdminCapabilities = {
  schemaVersion: 1,
  role: "OWNER",
  status: "ACTIVE",
  capabilities: [
    "VIEW_TODAY",
    "VIEW_CLUBS",
    "VIEW_CLUB_OPERATIONS",
    "VIEW_SERVICE_HEALTH",
    "VIEW_NOTIFICATION_OPERATIONS",
    "VIEW_AI_OPERATIONS",
    "VIEW_SUPPORT",
    "VIEW_AUDIT",
    "VIEW_ANALYTICS",
    "CREATE_CLUB",
    "MANAGE_CLUBS",
  ],
  generatedAt: "2026-08-22T00:00:00Z",
};

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

function seedCapabilities(
  client: QueryClient,
  capabilities: PlatformAdminCapabilities = ownerCapabilities,
) {
  client.setQueryData(platformAdminCapabilitiesQuery().queryKey, capabilities);
}

function seedCasePages(
  client: QueryClient,
  items: AdminOperationCase[],
  pages: AdminOperationCasesResponse[] = [listResponse(items)],
  extraFilters: AdminOperationCaseFilter[] = [],
) {
  const response = pages[0] ?? listResponse(items);
  const pageData = { pages, pageParams: pages.map((_, index) => (index === 0 ? null : `cursor-page-${index + 1}`)) };
  const filters: AdminOperationCaseFilter[] = [
    {},
    { states: ["OPEN"] },
    { states: ["OPEN", "ACKNOWLEDGED"] },
    { states: ["OPEN"], sources: ["NOTIFICATION"] },
    { states: ["OPEN", "ACKNOWLEDGED"], sources: ["NOTIFICATION"] },
    { states: ["OPEN", "ACKNOWLEDGED", "SNOOZED"], assignee: "ME" },
    ...extraFilters,
  ];
  for (const filter of filters) {
    client.setQueryData(platformAdminOperationCasesQuery(filter).queryKey, response);
    client.setQueryData(platformAdminOperationCasePagesQuery(filter).queryKey, pageData);
  }
}

function seededClient(items = [operationCase()]) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Number.POSITIVE_INFINITY } },
  });
  seedCapabilities(client);
  client.setQueryData(memberQueryKey, memberSnapshot);
  seedCasePages(client, items);
  for (const item of items) {
    client.setQueryData(platformAdminOperationCaseQuery(item.id).queryKey, detailResponse(item));
  }
  return client;
}

function freshClient() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Number.POSITIVE_INFINITY } },
  });
  seedCapabilities(client);
  client.setQueryData(memberQueryKey, memberSnapshot);
  return client;
}

function LocationProbe() {
  const location = useLocation();
  const navigate = useNavigate();
  return (
    <>
      <output aria-label="current location">{location.pathname}{location.search}</output>
      <button type="button" onClick={() => navigate(-1)}>뒤로</button>
      <button type="button" onClick={() => navigate(1)}>앞으로</button>
    </>
  );
}

async function openSecondaryControls(user: ReturnType<typeof userEvent.setup>) {
  const summary = await screen.findByText("필터와 신호 상태");
  if (!summary.closest("details")?.open) {
    await user.click(summary);
  }
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

function renderNavigableRoute(client: QueryClient, initialEntry = "/admin/today") {
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <Routes>
          <Route path="/admin/today" element={<><AdminTodayRoute /><LocationProbe /></>} />
          <Route path="/admin/audit" element={<LocationProbe />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("ResizeObserver", class {
    constructor(private readonly callback: ResizeObserverCallback) {}
    observe = (target: Element) => {
      this.callback(
        [{ target, contentRect: { width: 1200 } } as ResizeObserverEntry],
        this as unknown as ResizeObserver,
      );
    };
    disconnect = vi.fn();
  });
  operationsApi.fetchList.mockResolvedValue(listResponse());
  operationsApi.fetchDetail.mockResolvedValue(detailResponse());
  vi.mocked(fetchPlatformAdminCapabilities).mockResolvedValue(ownerCapabilities);
});

describe("AdminTodayRoute", () => {
  it("does not publish a route-owned header status sentence", async () => {
    renderRoute(seededClient(), "/admin/today?case=case-notification");

    expect(await screen.findByRole("heading", { level: 1, name: "오늘 할 일" })).toBeVisible();
    expect(useAdminShellStatus).not.toHaveBeenCalled();
  });

  it("restores a seeded case selection and renders the queue and inspector", async () => {
    const { container } = renderRoute(seededClient(), "/admin/today?case=case-notification");

    expect(await screen.findByRole("heading", { level: 1, name: "오늘 할 일" })).toBeVisible();
    expect(screen.getByRole("region", { name: "오늘 할 일" })).toHaveClass("admin-page-frame");
    expect(screen.getByRole("region", { name: "운영 케이스 큐" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "운영 케이스 상세" })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "작업" })).toHaveClass("admin-action-dock");
    expect(screen.getByRole("button", { name: /알림 전달 실패가 반복되고 있습니다/ })).toHaveAttribute("aria-pressed", "true");
    expect(findUnnamedInteractiveElements(container)).toEqual([]);
  });

  it.each([
    [null, "/admin/audit"],
    ["club-reading-sai", "/admin/audit?target=club-reading-sai"],
  ] as const)("follows the route-owned audit destination for club id %s", async (clubId, destination) => {
    const user = userEvent.setup();
    const item = operationCase({ clubId });
    renderNavigableRoute(seededClient([item]), "/admin/today?case=case-notification");

    await user.click(await screen.findByRole("link", { name: "전체 처리 기록 보기" }));

    await waitFor(() => {
      expect(screen.getByLabelText("current location")).toHaveTextContent(destination);
    });
    const location = screen.getByLabelText("current location").textContent ?? "";
    const parsed = new URL(location, "https://readmates.example");
    expect(parsed.pathname).toBe("/admin/audit");
    expect(parsed.searchParams.get("target")).toBe(clubId);
    expect(parsed.searchParams.get("target")).not.toBe("case-notification");
    expect(parsed.searchParams.get("target")).not.toBe("NOTIFICATION");
  });

  it("preserves a visible selected case when a filter changes", async () => {
    const user = userEvent.setup();
    renderRoute(seededClient(), "/admin/today?case=case-notification");

    await openSecondaryControls(user);
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
    expect(screen.queryByRole("button", { name: APPROVED_TODAY_ACTION_COPY.ACKNOWLEDGE })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: APPROVED_TODAY_ACTION_COPY.RESOLVE })).not.toBeInTheDocument();
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

    await user.click(await screen.findByRole("button", { name: APPROVED_TODAY_ACTION_COPY.ACKNOWLEDGE }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "최신 상태를 다시 불러왔습니다. 내용을 확인한 뒤 다시 시도해 주세요.",
    );
    await waitFor(() => expect(operationsApi.fetchDetail).toHaveBeenCalledWith("case-notification"));
    expect(client.getQueryState(adminOperationsKeys.detail("case-notification"))?.fetchStatus).toBe("idle");
  });

  it("never lets an older detail version overwrite a newer polled list lifecycle", async () => {
    const currentListCase = operationCase({
      state: "ACKNOWLEDGED",
      version: 5,
      allowedActions: ["SNOOZE", "RESOLVE"],
    });
    const staleDetailCase = operationCase({ state: "OPEN", version: 4 });
    const client = seededClient([currentListCase]);
    client.setQueryData(
      platformAdminOperationCaseQuery(currentListCase.id).queryKey,
      detailResponse(staleDetailCase),
    );

    renderRoute(client, "/admin/today?case=case-notification");

    expect(await screen.findAllByText("현재 상태 · 확인함")).toHaveLength(2);
    expect(screen.queryByRole("button", { name: APPROVED_TODAY_ACTION_COPY.ACKNOWLEDGE })).not.toBeInTheDocument();
    expect(screen.getByRole("group", { name: "작업" }).closest("[data-state]")).toHaveAttribute(
      "data-state",
      "stale",
    );
    expect(screen.getByRole("button", { name: APPROVED_TODAY_ACTION_COPY.SNOOZE })).toBeDisabled();
    expect(operationsApi.snooze).not.toHaveBeenCalled();
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
    await user.click(screen.getByRole("button", { name: /전체 .*보기/ }));
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
    expect(screen.getByLabelText("current location")).not.toHaveTextContent("@");
    expect(screen.getByLabelText("current location")).not.toHaveTextContent("token");
    expect(screen.getByLabelText("current location")).not.toHaveTextContent("ops-");
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

    await user.click(await screen.findByRole("button", { name: APPROVED_TODAY_ACTION_COPY.RESOLVE }));
    await user.click(screen.getByRole("button", { name: "신호 재검증 후 해결" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "신호가 아직 활성 상태입니다. 운영 상세에서 원인을 해소한 뒤 다시 확인해 주세요.",
    );
    expect(operationsApi.fetchDetail).not.toHaveBeenCalled();
  });

  it("restores user-selected filters through browser history", async () => {
    const user = userEvent.setup();
    renderRoute(seededClient(), "/admin/today?case=case-notification");

    await openSecondaryControls(user);
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
    seedCasePages(client, [operationCase()], [response]);
    operationsApi.fetchList.mockResolvedValue(response);
    renderRoute(client, "/admin/today?case=case-notification");

    await openSecondaryControls(user);
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
    expect(screen.queryByRole("button", { name: APPROVED_TODAY_ACTION_COPY.ACKNOWLEDGE })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: APPROVED_TODAY_ACTION_COPY.RESOLVE })).not.toBeInTheDocument();
  });

  it("removes stale lifecycle actions when a mutation is denied", async () => {
    const user = userEvent.setup();
    operationsApi.acknowledge.mockRejectedValue(
      Object.assign(new Error("forbidden"), { status: 403, code: "FORBIDDEN" }),
    );
    renderRoute(seededClient(), "/admin/today?case=case-notification");

    await user.click(await screen.findByRole("button", { name: APPROVED_TODAY_ACTION_COPY.ACKNOWLEDGE }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "상태 변경 권한이 더 이상 유효하지 않습니다. 새로고침 후 권한을 확인해 주세요.",
    );
    expect(screen.queryByRole("button", { name: APPROVED_TODAY_ACTION_COPY.ACKNOWLEDGE })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: APPROVED_TODAY_ACTION_COPY.RESOLVE })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /알림 전달 실패/ }));

    expect(screen.getByRole("alert")).toHaveTextContent(
      "상태 변경 권한이 더 이상 유효하지 않습니다. 새로고침 후 권한을 확인해 주세요.",
    );
    expect(screen.queryByRole("button", { name: APPROVED_TODAY_ACTION_COPY.ACKNOWLEDGE })).not.toBeInTheDocument();
  });

  it("renders forbidden without fetching cases when VIEW_TODAY is missing", async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: Number.POSITIVE_INFINITY } },
    });
    seedCapabilities(client, {
      ...ownerCapabilities,
      role: "SUPPORT",
      capabilities: ["VIEW_CLUBS", "VIEW_AUDIT"],
    });
    client.setQueryData(memberQueryKey, memberSnapshot);

    renderRoute(client);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "현재 역할로 운영 케이스를 확인할 수 없습니다. 권한을 확인해 주세요.",
    );
    expect(screen.getByRole("region", { name: "오늘 할 일" })).toHaveClass("admin-page-frame");
    expect(screen.queryByRole("region", { name: "운영 케이스 큐" })).not.toBeInTheDocument();
    expect(operationsApi.fetchList).not.toHaveBeenCalled();
    expect(operationsApi.fetchDetail).not.toHaveBeenCalled();
    expect(client.getQueryData(memberQueryKey)).toEqual(memberSnapshot);
  });

  it("renders unavailable without fetching cases when capabilities cannot be loaded", async () => {
    vi.mocked(fetchPlatformAdminCapabilities).mockRejectedValue(
      Object.assign(new Error("unavailable"), { status: 500, code: "UNAVAILABLE" }),
    );
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    client.setQueryData(memberQueryKey, memberSnapshot);

    renderRoute(client);

    expect(await screen.findByRole("alert")).toHaveTextContent("운영 케이스를 불러오지 못했습니다");
    expect(screen.getByRole("button", { name: "다시 시도" })).toBeInTheDocument();
    expect(operationsApi.fetchList).not.toHaveBeenCalled();
    expect(client.getQueryData(memberQueryKey)).toEqual(memberSnapshot);
  });

  it("renders unavailable with a retry when the list source fails with no cached cases", async () => {
    const user = userEvent.setup();
    operationsApi.fetchList.mockRejectedValue(
      Object.assign(new Error("unavailable"), { status: 500, code: "UNAVAILABLE" }),
    );
    const client = freshClient();
    renderRoute(client);

    expect(await screen.findByRole("alert")).toHaveTextContent("운영 케이스를 불러오지 못했습니다");
    expect(screen.getByText("잠시 뒤 다시 시도해 주세요.")).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "운영 케이스 큐" })).not.toBeInTheDocument();

    operationsApi.fetchList.mockResolvedValue(listResponse());
    await user.click(screen.getByRole("button", { name: "다시 시도" }));

    expect(await screen.findByRole("region", { name: "운영 케이스 큐" })).toBeInTheDocument();
    expect(operationsApi.fetchList).toHaveBeenCalledTimes(2);
  });

  it("keeps last-known-good cases when a background refresh fails", async () => {
    const client = seededClient();
    renderRoute(client, "/admin/today?case=case-notification");
    expect(await screen.findByRole("button", { name: /알림 전달 실패가 반복되고 있습니다/ })).toBeInTheDocument();

    operationsApi.fetchList.mockRejectedValue(
      Object.assign(new Error("unavailable"), { status: 503, code: "UNAVAILABLE" }),
    );
    await client.refetchQueries({ queryKey: adminOperationsKeys.lists() });

    expect(screen.getByRole("button", { name: /알림 전달 실패가 반복되고 있습니다/ })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("region", { name: "운영 케이스 상세" })).toBeInTheDocument();
    expect(screen.queryByText("운영 케이스를 불러오지 못했습니다")).not.toBeInTheDocument();
  });

  it("keeps the list usable when detail is independently unavailable", async () => {
    const item = operationCase();
    const client = seededClient([item]);
    client.removeQueries({ queryKey: platformAdminOperationCaseQuery(item.id).queryKey });
    operationsApi.fetchDetail.mockRejectedValue(
      Object.assign(new Error("detail missing"), { status: 500, code: "UNAVAILABLE" }),
    );

    renderRoute(client, "/admin/today?case=case-notification");

    expect(await screen.findByRole("region", { name: "운영 케이스 큐" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /알림 전달 실패가 반복되고 있습니다/ })).toBeEnabled();
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "상세 이력을 불러오지 못했습니다. 목록 정보는 계속 확인할 수 있습니다.",
    );
    expect(screen.queryByText("운영 케이스를 불러오지 못했습니다")).not.toBeInTheDocument();
  });

  it("announces success after a lifecycle mutation without starting mutation polling", async () => {
    const user = userEvent.setup();
    const acknowledged = operationCase({
      state: "ACKNOWLEDGED",
      version: 4,
      allowedActions: ["SNOOZE", "RESOLVE"],
    });
    operationsApi.acknowledge.mockResolvedValue({
      schema: "admin.operation_cases.v1",
      ...acknowledged,
    });
    operationsApi.fetchList.mockResolvedValue(listResponse([acknowledged]));
    operationsApi.fetchDetail.mockResolvedValue(detailResponse(acknowledged));
    renderRoute(seededClient(), "/admin/today?case=case-notification");

    await user.click(await screen.findByRole("button", { name: APPROVED_TODAY_ACTION_COPY.ACKNOWLEDGE }));

    expect(await screen.findByText("케이스 상태를 반영했습니다.")).toBeInTheDocument();
    expect(operationsApi.acknowledge).toHaveBeenCalledTimes(1);
    expect(operationsApi.acknowledge).toHaveBeenCalledWith("case-notification", 3);
  });

  it("returns L1 complete to ready so a follow-up snooze can run on the same case", async () => {
    const user = userEvent.setup();
    const acknowledged = operationCase({
      state: "ACKNOWLEDGED",
      version: 4,
      allowedActions: ["SNOOZE", "RESOLVE"],
    });
    operationsApi.acknowledge.mockResolvedValue({
      schema: "admin.operation_cases.v1",
      ...acknowledged,
    });
    operationsApi.fetchList.mockResolvedValue(listResponse([acknowledged]));
    operationsApi.fetchDetail.mockResolvedValue(detailResponse(acknowledged));
    operationsApi.snooze.mockResolvedValue({
      schema: "admin.operation_cases.v1",
      ...acknowledged,
      state: "SNOOZED",
      version: 5,
      allowedActions: ["ACKNOWLEDGE", "RESOLVE"],
    });
    renderRoute(seededClient(), "/admin/today?case=case-notification");

    await user.click(await screen.findByRole("button", { name: APPROVED_TODAY_ACTION_COPY.ACKNOWLEDGE }));
    expect(await screen.findByText("케이스 상태를 반영했습니다.")).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByRole("group", { name: "작업" }).closest("[data-state]")).toHaveAttribute(
        "data-state",
        "ready",
      );
    });
    expect(screen.queryByText("상태를 반영하고 있습니다.")).not.toBeInTheDocument();
    const hold = screen.getByRole("button", { name: APPROVED_TODAY_ACTION_COPY.SNOOZE });
    expect(hold).toBeEnabled();
    await user.click(hold);
    await user.click(screen.getByRole("button", { name: "미루기" }));

    await waitFor(() => {
      expect(operationsApi.snooze).toHaveBeenCalledWith(
        "case-notification",
        4,
        expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
      );
    });
  });

  it("does not treat a failed post-mutation refetch as L1 success", async () => {
    const user = userEvent.setup();
    const acknowledged = operationCase({
      state: "ACKNOWLEDGED",
      version: 4,
      allowedActions: ["SNOOZE", "RESOLVE"],
    });
    operationsApi.acknowledge.mockResolvedValue({
      schema: "admin.operation_cases.v1",
      ...acknowledged,
    });
    operationsApi.fetchList.mockRejectedValue(
      Object.assign(new Error("unavailable"), { status: 503, code: "UNAVAILABLE" }),
    );
    operationsApi.fetchDetail.mockRejectedValue(
      Object.assign(new Error("unavailable"), { status: 503, code: "UNAVAILABLE" }),
    );
    renderRoute(seededClient(), "/admin/today?case=case-notification");

    await user.click(await screen.findByRole("button", { name: APPROVED_TODAY_ACTION_COPY.ACKNOWLEDGE }));

    await waitFor(() => {
      expect(screen.getByRole("group", { name: "작업" }).closest("[data-state]")).toHaveAttribute(
        "data-state",
        "unknown-outcome",
      );
    });
    expect(screen.getAllByText(/명령 응답을 확인하지 못했습니다/).length).toBeGreaterThan(0);
    expect(screen.queryByText("케이스 상태를 반영했습니다.")).not.toBeInTheDocument();
    expect(screen.queryByText("상태를 반영하고 있습니다.")).not.toBeInTheDocument();
    expect(operationsApi.acknowledge).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(operationsApi.fetchDetail).toHaveBeenCalled());
    await waitFor(() => expect(operationsApi.fetchList).toHaveBeenCalled());
    expect(operationsApi.acknowledge).toHaveBeenCalledTimes(1);
  });

  it("stops Today polling after 403 purge without clearing member queries", async () => {
    const user = userEvent.setup();
    const client = seededClient();
    installPlatformAdminAuthorityLossHandler(client);
    operationsApi.acknowledge.mockRejectedValue(
      await apiErrorFromResponse(
        new Response(
          JSON.stringify({
            code: "FORBIDDEN",
            message: "이 작업을 수행할 권한이 없습니다.",
            status: 403,
          }),
          { status: 403, headers: { "Content-Type": "application/json" } },
        ),
      ),
    );
    renderRoute(client, "/admin/today?case=case-notification");
    await user.click(await screen.findByRole("button", { name: APPROVED_TODAY_ACTION_COPY.ACKNOWLEDGE }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "현재 역할로 운영 케이스를 확인할 수 없습니다. 권한을 확인해 주세요.",
    );
    expect(client.getQueryData(memberQueryKey)).toEqual(memberSnapshot);
    expect(client.getQueryData(platformAdminKeys.capabilities())).toBeUndefined();
    expect(operationsApi.fetchList).not.toHaveBeenCalled();
    expect(operationsApi.fetchDetail).not.toHaveBeenCalled();

    await waitFor(() => {
      const pages = client.getQueryCache().findAll({ queryKey: adminOperationsKeys.lists() });
      expect(pages.every((query) => query.isDisabled() || query.state.fetchStatus === "idle")).toBe(true);
    });
    expect(operationsApi.fetchList).not.toHaveBeenCalled();
  });

  it("does not strip a missing case from the URL or silently select another row", async () => {
    renderRoute(seededClient(), "/admin/today?case=case-missing");

    expect(await screen.findByRole("region", { name: "운영 케이스 큐" })).toBeInTheDocument();
    expect(screen.getByLabelText("current location")).toHaveTextContent("/admin/today?case=case-missing");
    expect(screen.getByLabelText("current location")).not.toHaveTextContent("case=case-notification");
    expect(screen.queryByRole("button", { name: /알림 전달 실패가 반복되고 있습니다/, pressed: true })).not.toBeInTheDocument();
  });

  it("freezes displayed order on a first-page poll after continuation and announces critical once", async () => {
    const user = userEvent.setup();
    const first = operationCase({ id: "case-first", severity: "CRITICAL", firstObservedAt: "2026-08-04T07:00:00Z" });
    const continuation = operationCase({
      id: "case-continued",
      severity: "WARNING",
      firstObservedAt: "2026-08-04T08:00:00Z",
    });
    const client = seededClient([first, continuation]);
    const pages = [
      { ...listResponse([first]), nextCursor: "cursor-page-2" },
      listResponse([continuation]),
    ];
    seedCasePages(client, [first, continuation], pages);
    client.setQueryData(platformAdminOperationCaseQuery(continuation.id).queryKey, detailResponse(continuation));

    renderRoute(client, "/admin/today?case=case-first");
    expect(await screen.findAllByRole("button", { name: /알림 전달 실패/ })).toHaveLength(2);

    const polledFirst = operationCase({
      id: "case-first",
      severity: "CRITICAL",
      version: 9,
      firstObservedAt: "2026-08-04T07:00:00Z",
    });
    const pendingWarning = operationCase({ id: "case-new-warning", severity: "WARNING" });
    const pendingCritical = operationCase({
      id: "case-new-critical",
      severity: "CRITICAL",
      summaryCode: "SESSION_CLOSING_BLOCKED",
    });
    const polledPages = [
      {
        ...listResponse([pendingCritical, polledFirst, pendingWarning]),
        nextCursor: "cursor-page-2",
        generatedAt: "2026-08-04T10:15:00Z",
        counts: { open: 4, critical: 2, assignedToMe: 1, snoozed: 0 },
      },
      listResponse([continuation]),
    ];

    act(() => {
      seedCasePages(client, [polledFirst, continuation], polledPages);
    });

    expect(screen.queryByRole("button", { name: /모임 마감이 완료되지 않았습니다/ })).not.toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /알림 전달 실패/ })).toHaveLength(2);
    await openSecondaryControls(user);
    expect(await screen.findByRole("button", { name: "새 항목 2개 적용" })).toBeInTheDocument();
    expect(screen.getByText("긴급 1건")).toBeInTheDocument();
    expect(await screen.findByText("새 긴급 신호 1건")).toHaveAttribute("aria-live", "polite");

    act(() => {
      seedCasePages(client, [polledFirst, continuation], polledPages);
    });
    expect(screen.getAllByText("새 긴급 신호 1건")).toHaveLength(1);

    await user.click(screen.getByRole("button", { name: "새 항목 2개 적용" }));
    expect(await screen.findByRole("button", { name: /모임 마감이 완료되지 않았습니다/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "새 항목 2개 적용" })).not.toBeInTheDocument();
  });

  it("locks lifecycle actions for a non-authoritative source and pending removal", async () => {
    const selected = operationCase({
      source: {
        ...operationCase().source,
        authoritative: false,
        status: "PARTIAL",
      },
    });
    const client = seededClient([selected]);
    renderRoute(client, "/admin/today?case=case-notification");

    expect(await screen.findByRole("button", { name: APPROVED_TODAY_ACTION_COPY.ACKNOWLEDGE })).toBeDisabled();
    expect(screen.getByRole("group", { name: "작업" }).closest("[data-state]")).toHaveAttribute(
      "data-state",
      "stale",
    );
    expect(screen.getByText("최신 상태가 아닙니다. 다시 확인한 뒤 작업을 이어가세요.")).toBeInTheDocument();
    expect(screen.queryByText("상태를 반영하고 있습니다.")).not.toBeInTheDocument();
    expect(operationsApi.acknowledge).not.toHaveBeenCalled();
  });

  it("cannot mutate when OWNER has empty allowedActions", async () => {
    renderRoute(
      seededClient([operationCase({ allowedActions: [] })]),
      "/admin/today?case=case-notification",
    );

    expect(await screen.findByText("현재 역할은 상태 변경 없이 운영 근거만 확인할 수 있습니다.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: APPROVED_TODAY_ACTION_COPY.ACKNOWLEDGE })).not.toBeInTheDocument();
    expect(operationsApi.acknowledge).not.toHaveBeenCalled();
  });

  it("does not reconstruct omitted lifecycle actions from an OWNER role", async () => {
    const client = seededClient([operationCase({ allowedActions: [] })]);
    seedCapabilities(client, {
      ...ownerCapabilities,
      role: "OWNER",
      capabilities: [...ownerCapabilities.capabilities],
    });

    renderRoute(client, "/admin/today?case=case-notification");

    expect(await screen.findByText("현재 역할은 상태 변경 없이 운영 근거만 확인할 수 있습니다.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: APPROVED_TODAY_ACTION_COPY.ACKNOWLEDGE })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: APPROVED_TODAY_ACTION_COPY.RESOLVE })).not.toBeInTheDocument();
    expect(operationsApi.acknowledge).not.toHaveBeenCalled();
    expect(operationsApi.resolve).not.toHaveBeenCalled();
  });

  it("does not announce L1 success until list and detail have been refetched", async () => {
    const user = userEvent.setup();
    const acknowledged = operationCase({
      state: "ACKNOWLEDGED",
      version: 4,
      allowedActions: ["SNOOZE", "RESOLVE"],
    });
    let releaseDetail: (() => void) | undefined;
    operationsApi.acknowledge.mockResolvedValue({
      schema: "admin.operation_cases.v1",
      ...acknowledged,
    });
    operationsApi.fetchList.mockResolvedValue(listResponse([acknowledged]));
    operationsApi.fetchDetail.mockImplementation(
      () => new Promise((resolve) => {
        releaseDetail = () => resolve(detailResponse(acknowledged));
      }),
    );
    renderRoute(seededClient(), "/admin/today?case=case-notification");

    await user.click(await screen.findByRole("button", { name: APPROVED_TODAY_ACTION_COPY.ACKNOWLEDGE }));

    expect(screen.queryByText("케이스 상태를 반영했습니다.")).not.toBeInTheDocument();
    expect(operationsApi.acknowledge).toHaveBeenCalledTimes(1);

    await act(async () => {
      releaseDetail?.();
    });

    expect(await screen.findByText("케이스 상태를 반영했습니다.")).toBeInTheDocument();
    expect(operationsApi.fetchDetail).toHaveBeenCalled();
    expect(operationsApi.fetchList).toHaveBeenCalled();
    expect(operationsApi.acknowledge).toHaveBeenCalledTimes(1);
  });

  it("enters unknown-outcome on response loss, reconciles, and performs zero blind retry", async () => {
    const user = userEvent.setup();
    operationsApi.acknowledge.mockRejectedValue(new ReadmatesTransportError());
    const client = seededClient();
    renderRoute(client, "/admin/today?case=case-notification");

    await user.click(await screen.findByRole("button", { name: APPROVED_TODAY_ACTION_COPY.ACKNOWLEDGE }));

    expect(await screen.findByRole("alert")).toHaveTextContent("명령 응답을 확인하지 못했습니다.");
    expect(screen.getByRole("group", { name: "작업" }).closest("[data-state]")).toHaveAttribute(
      "data-state",
      "unknown-outcome",
    );
    expect(screen.queryByText("상태를 반영하고 있습니다.")).not.toBeInTheDocument();
    await waitFor(() => expect(operationsApi.fetchList).toHaveBeenCalled());
    await waitFor(() => expect(operationsApi.fetchDetail).toHaveBeenCalled());
    expect(operationsApi.acknowledge).toHaveBeenCalledTimes(1);

    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(operationsApi.acknowledge).toHaveBeenCalledTimes(1);
  });

  it("keeps a mutation result on the captured case instead of the later selection", async () => {
    const user = userEvent.setup();
    const second = operationCase({
      id: "case-second",
      summaryCode: "CLUB_SETUP_REQUIRED",
      firstObservedAt: "2026-08-04T09:00:00Z",
    });
    let releaseAck: (() => void) | undefined;
    operationsApi.acknowledge.mockImplementation(
      () => new Promise((resolve) => {
        releaseAck = () => resolve({
          schema: "admin.operation_cases.v1",
          ...operationCase({ state: "ACKNOWLEDGED", version: 4, allowedActions: ["SNOOZE", "RESOLVE"] }),
        });
      }),
    );
    operationsApi.fetchList.mockResolvedValue(listResponse([
      operationCase({ state: "ACKNOWLEDGED", version: 4, allowedActions: ["SNOOZE", "RESOLVE"] }),
      second,
    ]));
    operationsApi.fetchDetail.mockResolvedValue(detailResponse(second));
    const client = seededClient([operationCase(), second]);
    renderRoute(client, "/admin/today?case=case-notification");

    await user.click(await screen.findByRole("button", { name: APPROVED_TODAY_ACTION_COPY.ACKNOWLEDGE }));
    await user.click(screen.getByRole("button", { name: /클럽 설정이 필요합니다/ }));

    await act(async () => {
      releaseAck?.();
    });

    expect(screen.queryByText("케이스 상태를 반영했습니다.")).not.toBeInTheDocument();
    expect(screen.getByLabelText("current location")).toHaveTextContent("case=case-second");
  });

  it("retries continuation failure without replacing last-known-good rows", async () => {
    const user = userEvent.setup();
    const first = operationCase({ id: "case-first", severity: "CRITICAL" });
    operationsApi.fetchList.mockImplementation(async (filter: { cursor?: string }) => {
      if (filter.cursor === "cursor-page-2") {
        throw Object.assign(new Error("unavailable"), { status: 503, code: "UNAVAILABLE" });
      }
      return { ...listResponse([first]), nextCursor: "cursor-page-2" };
    });
    renderRoute(freshClient(), "/admin/today?case=case-first&state=open&source=notification");

    expect(await screen.findByRole("button", { name: /알림 전달 실패/ })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /전체 .*보기/ }));
    await user.click(screen.getByRole("button", { name: "운영 케이스 더 보기" }));

    expect(await screen.findByRole("button", { name: "운영 케이스 더 보기" })).toBeEnabled();
    expect(screen.getByRole("button", { name: /알림 전달 실패/ })).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByText("운영 케이스를 불러오지 못했습니다")).not.toBeInTheDocument();
  });

  it("uses a mobile list/detail URL and restores row focus after Back", async () => {
    const user = userEvent.setup();
    let resize: ResizeObserverCallback | null = null;
    vi.stubGlobal("ResizeObserver", class {
      constructor(callback: ResizeObserverCallback) { resize = callback; }
      observe = (target: Element) => {
        resize?.([{ target, contentRect: { width: 390 } } as ResizeObserverEntry], {} as ResizeObserver);
      };
      disconnect = vi.fn();
    });
    renderRoute(seededClient(), "/admin/today?case=case-notification");

    expect(await screen.findByRole("region", { name: "운영 케이스 큐" })).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "운영 케이스 상세" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /알림 전달 실패가 반복되고 있습니다/ }));

    await waitFor(() => {
      expect(screen.getByLabelText("current location")).toHaveTextContent("case=case-notification");
      expect(screen.getByLabelText("current location")).toHaveTextContent("mode=detail");
    });
    expect(screen.getByRole("button", { name: "목록으로" })).toHaveFocus();

    await user.click(screen.getByRole("button", { name: "뒤로" }));

    await waitFor(() => {
      expect(screen.getByLabelText("current location")).not.toHaveTextContent("mode=detail");
    });
    expect(screen.getByRole("region", { name: "운영 케이스 큐" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /알림 전달 실패가 반복되고 있습니다/ })).toHaveFocus();

    await user.click(screen.getByRole("button", { name: "앞으로" }));
    await waitFor(() => expect(screen.getByLabelText("current location")).toHaveTextContent("mode=detail"));
    expect(screen.getByRole("button", { name: "목록으로" })).toHaveFocus();
    vi.unstubAllGlobals();
  });

  it("keeps a resolve result in the current detail until the operator explicitly chooses next", async () => {
    const user = userEvent.setup();
    const cases = [
      operationCase({
        id: "case-a",
        summaryCode: "NOTIFICATION_DELIVERY_FAILURE",
        firstObservedAt: "2026-08-04T06:00:00Z",
      }),
      operationCase({
        id: "case-b",
        sourceType: "AI_JOB",
        summaryCode: "AI_JOB_STALE",
        firstObservedAt: "2026-08-04T07:00:00Z",
        detailHref: "/admin/ai-ops",
      }),
      operationCase({
        id: "case-c",
        sourceType: "CLUB_READINESS",
        summaryCode: "CLUB_SETUP_REQUIRED",
        firstObservedAt: "2026-08-04T08:00:00Z",
        detailHref: "/admin/clubs/club-1",
      }),
      operationCase({
        id: "case-d",
        sourceType: "CLOSING_RISK",
        summaryCode: "SESSION_CLOSING_BLOCKED",
        firstObservedAt: "2026-08-04T09:00:00Z",
        detailHref: "/admin/clubs/club-1",
      }),
    ];
    const resolved = operationCase({
      ...cases[1]!,
      state: "RESOLVED",
      resolvedAt: "2026-08-04T10:05:00Z",
      version: 4,
      allowedActions: [],
    });
    operationsApi.resolve.mockResolvedValue({
      schema: "admin.operation_cases.v1",
      ...resolved,
    });
    operationsApi.fetchList.mockResolvedValue(listResponse([cases[0]!, resolved, cases[2]!, cases[3]!]));
    operationsApi.fetchDetail.mockImplementation(async (caseId: string) => {
      const item = caseId === "case-b" ? resolved : cases.find((entry) => entry.id === caseId) ?? resolved;
      return detailResponse(item);
    });
    renderRoute(seededClient(cases), "/admin/today?case=case-b");

    expect(await screen.findByText("케이스 2 / 4")).toBeInTheDocument();
    await user.click(await screen.findByRole("button", { name: APPROVED_TODAY_ACTION_COPY.RESOLVE }));
    await user.click(screen.getByRole("button", { name: "신호 재검증 후 해결" }));

    expect(await screen.findByText("케이스 상태를 반영했습니다.")).toBeInTheDocument();
    expect(screen.getByText("케이스 2 / 4")).toBeInTheDocument();
    expect(screen.getByLabelText("current location")).toHaveTextContent("case=case-b");
    await user.click(screen.getByRole("button", { name: "다음 ›" }));
    expect(await screen.findByText("케이스 3 / 4")).toBeInTheDocument();
    expect(screen.getByLabelText("current location")).toHaveTextContent("case=case-c");
    expect(operationsApi.resolve).toHaveBeenCalledWith("case-b", 3);
  });

  it("keeps a snooze result in the current detail and sends only the selected timestamp", async () => {
    const user = userEvent.setup();
    const cases = [
      operationCase({
        id: "case-a",
        summaryCode: "NOTIFICATION_DELIVERY_FAILURE",
        firstObservedAt: "2026-08-04T06:00:00Z",
      }),
      operationCase({
        id: "case-b",
        sourceType: "AI_JOB",
        summaryCode: "AI_JOB_STALE",
        firstObservedAt: "2026-08-04T07:00:00Z",
        detailHref: "/admin/ai-ops",
      }),
      operationCase({
        id: "case-c",
        sourceType: "CLUB_READINESS",
        summaryCode: "CLUB_SETUP_REQUIRED",
        firstObservedAt: "2026-08-04T08:00:00Z",
        detailHref: "/admin/clubs/club-1",
      }),
      operationCase({
        id: "case-d",
        sourceType: "CLOSING_RISK",
        summaryCode: "SESSION_CLOSING_BLOCKED",
        firstObservedAt: "2026-08-04T09:00:00Z",
        detailHref: "/admin/clubs/club-1",
      }),
    ];
    const snoozed = operationCase({
      ...cases[1]!,
      state: "SNOOZED",
      snoozedUntil: "2026-08-04T14:00:00Z",
      version: 4,
      allowedActions: ["ACKNOWLEDGE", "RESOLVE"],
    });
    operationsApi.snooze.mockResolvedValue({
      schema: "admin.operation_cases.v1",
      ...snoozed,
    });
    operationsApi.fetchList.mockResolvedValue(listResponse([cases[0]!, snoozed, cases[2]!, cases[3]!]));
    operationsApi.fetchDetail.mockImplementation(async (caseId: string) => {
      const item = caseId === "case-b" ? snoozed : cases.find((entry) => entry.id === caseId) ?? snoozed;
      return detailResponse(item);
    });
    renderRoute(seededClient(cases), "/admin/today?case=case-b");

    expect(await screen.findByText("케이스 2 / 4")).toBeInTheDocument();
    await user.click(await screen.findByRole("button", { name: APPROVED_TODAY_ACTION_COPY.SNOOZE }));
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "미루기" }));

    expect(await screen.findByText("케이스 상태를 반영했습니다.")).toBeInTheDocument();
    expect(screen.getByText("케이스 2 / 4")).toBeInTheDocument();
    expect(screen.getByLabelText("current location")).toHaveTextContent("case=case-b");
    expect(operationsApi.snooze).toHaveBeenCalledWith(
      "case-b",
      3,
      expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
    );
  });

  it("keeps the final resolve result on the current case", async () => {
    const user = userEvent.setup();
    const last = operationCase({ id: "case-last" });
    const resolved = operationCase({
      id: "case-last",
      state: "RESOLVED",
      resolvedAt: "2026-08-04T10:05:00Z",
      version: 4,
      allowedActions: [],
    });
    operationsApi.resolve.mockResolvedValue({
      schema: "admin.operation_cases.v1",
      ...resolved,
    });
    operationsApi.fetchList.mockResolvedValue(listResponse([resolved]));
    operationsApi.fetchDetail.mockResolvedValue(detailResponse(resolved));
    renderRoute(seededClient([last]), "/admin/today?case=case-last");

    expect(await screen.findByText("케이스 1 / 1")).toBeInTheDocument();
    await user.click(await screen.findByRole("button", { name: APPROVED_TODAY_ACTION_COPY.RESOLVE }));
    await user.click(screen.getByRole("button", { name: "신호 재검증 후 해결" }));

    expect(await screen.findByText("케이스 상태를 반영했습니다.")).toBeInTheDocument();
    expect(screen.getByLabelText("current location")).toHaveTextContent("case=case-last");
    expect(screen.getByRole("button", { name: "다음 ›" })).toBeDisabled();
    expect(operationsApi.resolve).toHaveBeenCalledWith("case-last", 3);
  });

  it("keeps the final snooze result on the current case", async () => {
    const user = userEvent.setup();
    const last = operationCase({ id: "case-last" });
    const snoozed = operationCase({
      id: "case-last",
      state: "SNOOZED",
      snoozedUntil: "2026-08-11T10:00:00Z",
      version: 4,
      allowedActions: ["ACKNOWLEDGE", "RESOLVE"],
    });
    operationsApi.snooze.mockResolvedValue({
      schema: "admin.operation_cases.v1",
      ...snoozed,
    });
    operationsApi.fetchList.mockResolvedValue(listResponse([snoozed]));
    operationsApi.fetchDetail.mockResolvedValue(detailResponse(snoozed));
    renderRoute(seededClient([last]), "/admin/today?case=case-last");

    expect(await screen.findByText("케이스 1 / 1")).toBeInTheDocument();
    await user.click(await screen.findByRole("button", { name: APPROVED_TODAY_ACTION_COPY.SNOOZE }));
    await user.click(screen.getByRole("button", { name: "미루기" }));

    expect(await screen.findByText("케이스 상태를 반영했습니다.")).toBeInTheDocument();
    expect(screen.getByLabelText("current location")).toHaveTextContent("case=case-last");
    expect(operationsApi.snooze).toHaveBeenCalledWith(
      "case-last",
      3,
      expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
    );
  });
});
