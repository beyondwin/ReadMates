import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiErrorFromResponse } from "@/shared/api/errors";
import type { PlatformAdminCapability } from "@/features/platform-admin/model/platform-admin-capabilities";
import type { PlatformAdminRole } from "@/features/platform-admin/model/platform-admin-domain-types";
import {
  adminTakedownKeys,
} from "@/features/platform-admin/queries/platform-admin-takedown-queries";
import {
  installPlatformAdminAuthorityLossHandler,
  platformAdminCapabilitiesQuery,
  platformAdminSummaryQuery,
} from "@/features/platform-admin/queries/platform-admin-queries";

vi.mock("@/features/platform-admin/api/platform-admin-takedown-api", () => ({
  confirmAdminPublicTakedown: vi.fn(),
  fetchAdminTakedownConvergence: vi.fn(),
  previewAdminPublicTakedown: vi.fn(),
  retryAdminTakedownConvergence: vi.fn(),
}));

vi.mock("@/features/platform-admin/api/platform-admin-api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/platform-admin/api/platform-admin-api")>()),
  fetchPlatformAdminSummary: vi.fn(),
}));

vi.mock("@/features/platform-admin/api/platform-admin-capabilities-api", () => ({
  fetchPlatformAdminCapabilities: vi.fn(() => new Promise(() => undefined)),
}));

import { fetchPlatformAdminSummary } from "@/features/platform-admin/api/platform-admin-api";
import { fetchPlatformAdminCapabilities } from "@/features/platform-admin/api/platform-admin-capabilities-api";
import {
  confirmAdminPublicTakedown,
  fetchAdminTakedownConvergence,
  previewAdminPublicTakedown,
  retryAdminTakedownConvergence,
} from "@/features/platform-admin/api/platform-admin-takedown-api";
import { AdminPublicTakedownRoute } from "./admin-public-takedown-route";

const RECEIPT_STORAGE_KEY = "readmates:admin-public-takedown:latest-receipt";

const summary = {
  platformRole: "OPERATOR" as const,
  activeClubCount: 1,
  domainActionRequiredCount: 0,
  domains: [],
  domainsRequiringAction: [],
};

const preview = {
  schema: "admin.public_takedown.preview.v1" as const,
  previewId: "40000000-0000-4000-8000-000000000004",
  expiresAt: "2026-08-26T04:05:00Z",
  clubId: "10000000-0000-4000-8000-000000000001",
  sessionId: "20000000-0000-4000-8000-000000000002",
  publicationId: "30000000-0000-4000-8000-000000000003",
  targetGeneration: 17,
  currentSurfaces: ["PUBLIC_CLUB", "PUBLIC_SESSION"],
  limitationCode: "STORED_OR_OFFLINE_COPY_MAY_REMAIN" as const,
};

const receipt = {
  schema: "admin.public_takedown.receipt.v1" as const,
  receiptId: "50000000-0000-4000-8000-000000000005",
  convergenceId: "60000000-0000-4000-8000-000000000006",
  clubId: preview.clubId,
  sessionId: preview.sessionId,
  publicationId: preview.publicationId,
  originResult: "DENIED" as const,
  committedGeneration: 18,
  committedClubGeneration: 9,
  reasonCategory: "PRIVACY",
  createdAt: "2026-08-26T04:01:00Z",
  limitationCode: "STORED_OR_OFFLINE_COPY_MAY_REMAIN" as const,
};

const pendingConvergence = {
  schema: "admin.public_takedown.convergence.v1" as const,
  convergenceId: receipt.convergenceId,
  originResult: "DENIED" as const,
  committedGeneration: 18,
  status: "PENDING" as const,
  lastAttemptAt: "2026-08-26T04:01:01Z",
  retryable: false,
  attempts: [{ attemptNo: 1, status: "PENDING" as const, observedAt: "2026-08-26T04:01:01Z", resultCategory: null }],
};

const failedConvergence = {
  ...pendingConvergence,
  status: "FAILED" as const,
  retryable: true,
  lastAttemptAt: "2026-08-26T04:02:00Z",
  attempts: [{ attemptNo: 1, status: "FAILED" as const, observedAt: "2026-08-26T04:02:00Z", resultCategory: "TEMPORARY_FAILURE" as const }],
};

const TAKEDOWN_CAPS: PlatformAdminCapability[] = ["VIEW_TODAY", "VIEW_CLUBS", "EMERGENCY_PUBLIC_TAKEDOWN"];

async function forbiddenError() {
  return apiErrorFromResponse(
    new Response(
      JSON.stringify({
        code: "PERMISSION_DENIED",
        message: "이 작업을 수행할 권한이 없습니다.",
        status: 403,
      }),
      { status: 403, headers: { "Content-Type": "application/json" } },
    ),
  );
}

function renderRoute(options: {
  role?: PlatformAdminRole;
  capabilities?: PlatformAdminCapability[] | null;
  seedSummary?: boolean;
} = {}) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity }, mutations: { retry: 3 } },
  });
  installPlatformAdminAuthorityLossHandler(client);
  const role = options.role ?? summary.platformRole;
  if (options.seedSummary !== false) {
    client.setQueryData(platformAdminSummaryQuery().queryKey, { ...summary, platformRole: role });
  }
  if (options.capabilities !== null) {
    client.setQueryData(platformAdminCapabilitiesQuery().queryKey, {
      schemaVersion: 1,
      role,
      status: "ACTIVE",
      capabilities: options.capabilities ?? TAKEDOWN_CAPS,
      generatedAt: "2026-08-26T04:00:00Z",
    });
  }
  return {
    queryClient: client,
    ...render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={["/admin/public-takedown"]}>
          <AdminPublicTakedownRoute />
        </MemoryRouter>
      </QueryClientProvider>,
    ),
  };
}

async function fillTargetAndPreview() {
  fireEvent.change(screen.getByLabelText("클럽 ID"), { target: { value: preview.clubId } });
  fireEvent.change(screen.getByLabelText("모임 ID"), { target: { value: preview.sessionId } });
  fireEvent.change(screen.getByLabelText("공개 기록 ID"), { target: { value: preview.publicationId } });
  fireEvent.click(screen.getByRole("button", { name: "대상 확인" }));
  await screen.findByRole("button", { name: "긴급 회수 확인" });
}

beforeEach(() => {
  vi.clearAllMocks();
  sessionStorage.clear();
  vi.mocked(fetchAdminTakedownConvergence).mockResolvedValue(pendingConvergence);
});

describe("AdminPublicTakedownRoute", () => {
  it("keeps the system-admin workbench and previews the exact entered UUID target", async () => {
    vi.mocked(previewAdminPublicTakedown).mockResolvedValue(preview);
    renderRoute();

    fireEvent.change(screen.getByLabelText("클럽 ID"), { target: { value: preview.clubId } });
    fireEvent.change(screen.getByLabelText("모임 ID"), { target: { value: preview.sessionId } });
    fireEvent.change(screen.getByLabelText("공개 기록 ID"), { target: { value: preview.publicationId } });
    fireEvent.click(screen.getByRole("button", { name: "대상 확인" }));

    await waitFor(() => expect(previewAdminPublicTakedown).toHaveBeenCalledWith({
      clubId: preview.clubId,
      sessionId: preview.sessionId,
      publicationId: preview.publicationId,
    }));
    expect(screen.queryByLabelText(/클럽 선택/)).not.toBeInTheDocument();
  });

  it("fails closed for SUPPORT", () => {
    renderRoute({ role: "SUPPORT", capabilities: ["VIEW_TODAY", "VIEW_CLUBS"] });
    expect(screen.getByText("긴급 회수 권한이 없습니다.")).toBeInTheDocument();
    expect(screen.queryByLabelText("클럽 ID")).not.toBeInTheDocument();
    expect(previewAdminPublicTakedown).not.toHaveBeenCalled();
  });

  it("does not give OWNER the mutation form without EMERGENCY_PUBLIC_TAKEDOWN and the handler makes zero requests", () => {
    renderRoute({ role: "OWNER", capabilities: ["VIEW_TODAY", "VIEW_CLUBS"] });
    expect(screen.getByText("긴급 회수 권한이 없습니다.")).toBeInTheDocument();
    expect(screen.queryByLabelText("클럽 ID")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "대상 확인" })).not.toBeInTheDocument();
    expect(previewAdminPublicTakedown).not.toHaveBeenCalled();
    expect(confirmAdminPublicTakedown).not.toHaveBeenCalled();
    expect(fetchAdminTakedownConvergence).not.toHaveBeenCalled();
  });

  it("lets OPERATOR preview when the exact EMERGENCY_PUBLIC_TAKEDOWN capability is present", async () => {
    vi.mocked(previewAdminPublicTakedown).mockResolvedValue(preview);
    renderRoute({ role: "OPERATOR", capabilities: TAKEDOWN_CAPS });
    await fillTargetAndPreview();
    expect(previewAdminPublicTakedown).toHaveBeenCalledTimes(1);
  });

  it("does not throw or expose the mutation form before summary has loaded", () => {
    vi.mocked(fetchPlatformAdminSummary).mockImplementation(() => new Promise(() => undefined));
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    client.setQueryData(platformAdminCapabilitiesQuery().queryKey, {
      schemaVersion: 1,
      role: "OWNER",
      status: "ACTIVE",
      capabilities: TAKEDOWN_CAPS,
      generatedAt: "2026-08-26T04:00:00Z",
    });

    expect(() =>
      render(
        <QueryClientProvider client={client}>
          <MemoryRouter initialEntries={["/admin/public-takedown"]}>
            <AdminPublicTakedownRoute />
          </MemoryRouter>
        </QueryClientProvider>,
      ),
    ).not.toThrow();
    expect(screen.getByRole("heading", { name: "긴급 공개 회수" })).toBeInTheDocument();
    expect(screen.queryByLabelText("클럽 ID")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "대상 확인" })).not.toBeInTheDocument();
  });

  it("fails closed when the summary projection cannot be loaded", async () => {
    vi.mocked(fetchPlatformAdminSummary).mockRejectedValue(new Error("summary unavailable"));
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    client.setQueryData(platformAdminCapabilitiesQuery().queryKey, {
      schemaVersion: 1,
      role: "OWNER",
      status: "ACTIVE",
      capabilities: TAKEDOWN_CAPS,
      generatedAt: "2026-08-26T04:00:00Z",
    });

    render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={["/admin/public-takedown"]}>
          <AdminPublicTakedownRoute />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(await screen.findByText("긴급 회수 권한이 없습니다.")).toBeInTheDocument();
    expect(screen.queryByLabelText("클럽 ID")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "대상 확인" })).not.toBeInTheDocument();
  });

  it("restores a sessionStorage receipt after EMERGENCY_PUBLIC_TAKEDOWN is ready", async () => {
    sessionStorage.setItem(RECEIPT_STORAGE_KEY, JSON.stringify(receipt));
    vi.mocked(fetchAdminTakedownConvergence).mockResolvedValue(pendingConvergence);
    renderRoute();

    expect(await screen.findByRole("region", { name: "변경 불가 회수 영수증" })).toHaveTextContent(receipt.receiptId);
    await waitFor(() => expect(fetchAdminTakedownConvergence).toHaveBeenCalledWith(receipt.receiptId));
  });

  it("does not restore, render, or query a sessionStorage receipt before capability is ready", () => {
    sessionStorage.setItem(RECEIPT_STORAGE_KEY, JSON.stringify(receipt));
    vi.mocked(fetchPlatformAdminCapabilities).mockImplementation(() => new Promise(() => undefined));
    renderRoute({ capabilities: null });

    expect(screen.queryByRole("region", { name: "변경 불가 회수 영수증" })).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "명령 기록" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("클럽 ID")).not.toBeInTheDocument();
    expect(fetchAdminTakedownConvergence).not.toHaveBeenCalled();
    expect(sessionStorage.getItem(RECEIPT_STORAGE_KEY)).toBe(JSON.stringify(receipt));
  });

  it("purges preview, identity, receipt, convergence cache, and storage after a preview 403", async () => {
    vi.mocked(previewAdminPublicTakedown).mockRejectedValue(await forbiddenError());
    const { queryClient } = renderRoute();
    queryClient.setQueryData(adminTakedownKeys.convergence(receipt.receiptId), pendingConvergence);
    fireEvent.change(screen.getByLabelText("클럽 ID"), { target: { value: preview.clubId } });
    fireEvent.change(screen.getByLabelText("모임 ID"), { target: { value: preview.sessionId } });
    fireEvent.change(screen.getByLabelText("공개 기록 ID"), { target: { value: preview.publicationId } });
    fireEvent.click(screen.getByRole("button", { name: "대상 확인" }));

    await waitFor(() => {
      expect(previewAdminPublicTakedown).toHaveBeenCalledTimes(1);
      expect(queryClient.getQueryData(platformAdminCapabilitiesQuery().queryKey)).toBeUndefined();
    });
    expect(screen.queryByRole("button", { name: "긴급 회수 확인" })).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "변경 불가 회수 영수증" })).not.toBeInTheDocument();
    expect(sessionStorage.getItem(RECEIPT_STORAGE_KEY)).toBeNull();
    expect(queryClient.getQueryData(adminTakedownKeys.convergence(receipt.receiptId))).toBeUndefined();
    expect(confirmAdminPublicTakedown).not.toHaveBeenCalled();

    act(() => {
      queryClient.setQueryData(platformAdminSummaryQuery().queryKey, summary);
      queryClient.setQueryData(platformAdminCapabilitiesQuery().queryKey, {
        schemaVersion: 1,
        role: "OPERATOR",
        status: "ACTIVE",
        capabilities: TAKEDOWN_CAPS,
        generatedAt: "2026-08-26T04:00:00Z",
      });
    });
    expect(await screen.findByRole("button", { name: "대상 확인" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "긴급 회수 확인" })).not.toBeInTheDocument();
    expect(previewAdminPublicTakedown).toHaveBeenCalledTimes(1);
  });

  it("purges command state after a confirm 403 without automatic retry", async () => {
    vi.mocked(previewAdminPublicTakedown).mockResolvedValue(preview);
    vi.mocked(confirmAdminPublicTakedown).mockRejectedValue(await forbiddenError());
    const { queryClient } = renderRoute();
    await fillTargetAndPreview();
    fireEvent.change(screen.getByLabelText("회수 사유"), { target: { value: "synthetic privacy request" } });
    fireEvent.click(screen.getByRole("button", { name: "긴급 회수 확인" }));

    await waitFor(() => {
      expect(confirmAdminPublicTakedown).toHaveBeenCalledTimes(1);
      expect(queryClient.getQueryData(platformAdminCapabilitiesQuery().queryKey)).toBeUndefined();
    });
    expect(screen.queryByRole("region", { name: "변경 불가 회수 영수증" })).not.toBeInTheDocument();
    expect(sessionStorage.getItem(RECEIPT_STORAGE_KEY)).toBeNull();
    expect(queryClient.getQueryData(adminTakedownKeys.all)).toBeUndefined();
    expect(previewAdminPublicTakedown).toHaveBeenCalledTimes(1);
  });

  it("purges the same takedown state when EMERGENCY_PUBLIC_TAKEDOWN is removed from the projection", async () => {
    vi.mocked(previewAdminPublicTakedown).mockResolvedValue(preview);
    vi.mocked(confirmAdminPublicTakedown).mockResolvedValue(receipt);
    vi.mocked(fetchAdminTakedownConvergence).mockResolvedValue(failedConvergence);
    const { queryClient } = renderRoute();
    await fillTargetAndPreview();
    fireEvent.change(screen.getByLabelText("회수 사유"), { target: { value: "synthetic privacy request" } });
    fireEvent.click(screen.getByRole("button", { name: "긴급 회수 확인" }));
    expect(await screen.findByRole("region", { name: "변경 불가 회수 영수증" })).toBeInTheDocument();
    expect(sessionStorage.getItem(RECEIPT_STORAGE_KEY)).toContain(receipt.receiptId);

    act(() => {
      queryClient.setQueryData(platformAdminCapabilitiesQuery().queryKey, {
        schemaVersion: 1,
        role: "OPERATOR",
        status: "ACTIVE",
        capabilities: ["VIEW_TODAY", "VIEW_CLUBS"],
        generatedAt: "2026-08-26T04:00:00Z",
      });
    });

    await waitFor(() => {
      expect(screen.queryByRole("region", { name: "변경 불가 회수 영수증" })).not.toBeInTheDocument();
    });
    expect(screen.getByText("긴급 회수 권한이 없습니다.")).toBeInTheDocument();
    expect(sessionStorage.getItem(RECEIPT_STORAGE_KEY)).toBeNull();
    expect(queryClient.getQueryData(adminTakedownKeys.convergence(receipt.receiptId))).toBeUndefined();

    act(() => {
      queryClient.setQueryData(platformAdminCapabilitiesQuery().queryKey, {
        schemaVersion: 1,
        role: "OPERATOR",
        status: "ACTIVE",
        capabilities: TAKEDOWN_CAPS,
        generatedAt: "2026-08-26T04:00:00Z",
      });
    });
    expect(await screen.findByRole("button", { name: "대상 확인" })).toBeInTheDocument();
    expect(screen.getByLabelText("클럽 ID")).toHaveValue("");
    expect(screen.queryByRole("region", { name: "변경 불가 회수 영수증" })).not.toBeInTheDocument();
    expect(confirmAdminPublicTakedown).toHaveBeenCalledTimes(1);
  });

  it("retains one confirm identity across response loss and resumes L3 convergence", async () => {
    vi.mocked(previewAdminPublicTakedown).mockResolvedValue(preview);
    vi.mocked(confirmAdminPublicTakedown)
      .mockRejectedValueOnce(new Error("response lost"))
      .mockResolvedValueOnce(receipt);
    vi.mocked(fetchAdminTakedownConvergence).mockResolvedValue(failedConvergence);
    vi.mocked(retryAdminTakedownConvergence).mockResolvedValue({
      ...failedConvergence,
      status: "PENDING",
      retryable: false,
      attempts: [
        ...failedConvergence.attempts,
        { attemptNo: 2, status: "PENDING", observedAt: "2026-08-26T04:03:00Z", resultCategory: null },
      ],
    });
    renderRoute();

    await fillTargetAndPreview();
    fireEvent.change(screen.getByLabelText("회수 사유"), { target: { value: "synthetic privacy request" } });
    fireEvent.click(screen.getByRole("button", { name: "긴급 회수 확인" }));
    await screen.findByRole("button", { name: "긴급 회수 확인" });
    fireEvent.click(screen.getByRole("button", { name: "긴급 회수 확인" }));

    await waitFor(() => expect(confirmAdminPublicTakedown).toHaveBeenCalledTimes(2));
    expect(vi.mocked(confirmAdminPublicTakedown).mock.calls[0]?.[0].idempotencyKey).toBe(
      vi.mocked(confirmAdminPublicTakedown).mock.calls[1]?.[0].idempotencyKey,
    );
    expect(previewAdminPublicTakedown).toHaveBeenCalledTimes(1);
    expect(await screen.findByRole("region", { name: "변경 불가 회수 영수증" })).toHaveTextContent(receipt.receiptId);
    expect(screen.getByRole("region", { name: "명령 기록" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "전파 다시 시도" }));
    await waitFor(() => expect(retryAdminTakedownConvergence).toHaveBeenCalledWith(receipt.receiptId));
    expect(confirmAdminPublicTakedown).toHaveBeenCalledTimes(2);
    expect(await screen.findByRole("region", { name: "전파 수렴 타임라인" })).toHaveTextContent("시도 2");
  });
});
