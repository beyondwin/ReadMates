import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import type { PropsWithChildren } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiErrorFromResponse, ReadmatesTransportError } from "@/shared/api/errors";
import {
  installPlatformAdminAuthorityLossHandler,
  platformAdminCapabilitiesQuery,
} from "@/features/platform-admin/queries/platform-admin-queries";

vi.mock("@/features/platform-admin/api/platform-admin-takedown-api", () => ({
  confirmAdminPublicTakedown: vi.fn(),
  fetchAdminTakedownConvergence: vi.fn(),
  previewAdminPublicTakedown: vi.fn(),
  retryAdminTakedownConvergence: vi.fn(),
}));

import {
  confirmAdminPublicTakedown,
  fetchAdminTakedownConvergence,
  previewAdminPublicTakedown,
  retryAdminTakedownConvergence,
} from "@/features/platform-admin/api/platform-admin-takedown-api";
import {
  adminTakedownConvergenceQuery,
  adminTakedownKeys,
  useConfirmAdminPublicTakedownMutation,
  usePreviewAdminPublicTakedownMutation,
  useRetryAdminTakedownConvergenceMutation,
} from "./platform-admin-takedown-queries";

const receipt = {
  schema: "admin.public_takedown.receipt.v1" as const,
  receiptId: "50000000-0000-4000-8000-000000000005",
  convergenceId: "60000000-0000-4000-8000-000000000006",
  clubId: "10000000-0000-4000-8000-000000000001",
  sessionId: "20000000-0000-4000-8000-000000000002",
  publicationId: "30000000-0000-4000-8000-000000000003",
  originResult: "DENIED" as const,
  committedGeneration: 18,
  committedClubGeneration: 9,
  reasonCategory: "PRIVACY",
  createdAt: "2026-08-26T04:01:00Z",
  limitationCode: "STORED_OR_OFFLINE_COPY_MAY_REMAIN" as const,
};

const failed = {
  schema: "admin.public_takedown.convergence.v1" as const,
  convergenceId: receipt.convergenceId,
  originResult: "DENIED" as const,
  committedGeneration: 18,
  status: "FAILED" as const,
  lastAttemptAt: "2026-08-26T04:02:00Z",
  retryable: true,
  attempts: [{ attemptNo: 1, status: "FAILED" as const, observedAt: "2026-08-26T04:02:00Z", resultCategory: "TEMPORARY_FAILURE" as const }],
};

function wrapper() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: 3 } },
  });
  installPlatformAdminAuthorityLossHandler(client);
  function Wrapper({ children }: PropsWithChildren) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  }
  return { client, Wrapper };
}

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

const TAKEDOWN_CAPS = {
  schemaVersion: 1 as const,
  role: "OWNER" as const,
  status: "ACTIVE" as const,
  capabilities: ["EMERGENCY_PUBLIC_TAKEDOWN"] as const,
  generatedAt: "2026-08-26T04:00:00Z",
};

beforeEach(() => vi.clearAllMocks());

describe("platform-admin takedown queries", () => {
  it("uses receipt identity for the convergence resource", async () => {
    vi.mocked(fetchAdminTakedownConvergence).mockResolvedValue(failed);
    const query = adminTakedownConvergenceQuery(receipt.receiptId);
    await query.queryFn?.({} as never);
    expect(query.queryKey).toEqual([...adminTakedownKeys.all, "receipt", receipt.receiptId, "convergence"]);
    expect(fetchAdminTakedownConvergence).toHaveBeenCalledWith(receipt.receiptId);
  });

  it("reconciles a response-loss confirm with the exact same idempotency key", async () => {
    vi.mocked(confirmAdminPublicTakedown)
      .mockRejectedValueOnce(new ReadmatesTransportError())
      .mockResolvedValueOnce(receipt);
    const { Wrapper } = wrapper();
    const { result } = renderHook(() => useConfirmAdminPublicTakedownMutation(), { wrapper: Wrapper });
    const request = { previewId: "40000000-0000-4000-8000-000000000004", reasonCategory: "PRIVACY", reason: "confirmed", idempotencyKey: "admin-fixed-key" };

    await act(async () => { await result.current.mutateAsync(request); });

    expect(confirmAdminPublicTakedown).toHaveBeenCalledTimes(2);
    expect(confirmAdminPublicTakedown).toHaveBeenNthCalledWith(1, request);
    expect(confirmAdminPublicTakedown).toHaveBeenNthCalledWith(2, request);
  });

  it("uses adminTakedownKeys.all as mutation keys and does not retry a 403", async () => {
    vi.mocked(previewAdminPublicTakedown).mockRejectedValue(await forbiddenError());
    const { client, Wrapper } = wrapper();
    client.setQueryData(platformAdminCapabilitiesQuery().queryKey, TAKEDOWN_CAPS);
    client.setQueryData(adminTakedownKeys.convergence(receipt.receiptId), failed);
    const { result } = renderHook(() => usePreviewAdminPublicTakedownMutation(), { wrapper: Wrapper });

    await act(async () => {
      await result.current.mutateAsync({
        clubId: receipt.clubId,
        sessionId: receipt.sessionId,
        publicationId: receipt.publicationId,
      }).catch(() => undefined);
    });

    const previewMutation = client.getMutationCache().find({ mutationKey: adminTakedownKeys.all });
    expect(previewMutation?.options.mutationKey).toEqual(adminTakedownKeys.all);
    expect(previewMutation?.options.retry).toBe(0);
    expect(previewAdminPublicTakedown).toHaveBeenCalledTimes(1);
    expect(client.getQueryData(platformAdminCapabilitiesQuery().queryKey)).toBeUndefined();
    expect(client.getQueryData(adminTakedownKeys.convergence(receipt.receiptId))).toBeUndefined();
  });

  it("does not retry a failed confirm 403 and keeps the same mutation key", async () => {
    vi.mocked(confirmAdminPublicTakedown).mockRejectedValue(await forbiddenError());
    const { client, Wrapper } = wrapper();
    client.setQueryData(platformAdminCapabilitiesQuery().queryKey, TAKEDOWN_CAPS);
    const { result } = renderHook(() => useConfirmAdminPublicTakedownMutation(), { wrapper: Wrapper });

    await act(async () => {
      await result.current
        .mutateAsync({
          previewId: "40000000-0000-4000-8000-000000000004",
          reasonCategory: "PRIVACY",
          reason: "confirmed",
          idempotencyKey: "admin-fixed-key",
        })
        .catch(() => undefined);
    });

    const confirmMutation = client.getMutationCache().find({ mutationKey: adminTakedownKeys.all });
    expect(confirmMutation?.options.mutationKey).toEqual(adminTakedownKeys.all);
    expect(confirmMutation?.options.retry).toBe(0);
    expect(confirmAdminPublicTakedown).toHaveBeenCalledTimes(1);
    expect(client.getQueryData(platformAdminCapabilitiesQuery().queryKey)).toBeUndefined();
  });

  it("retries convergence under the same receipt and appends a provider attempt", async () => {
    const retried = {
      ...failed,
      status: "SUCCEEDED" as const,
      retryable: false,
      attempts: [...failed.attempts, { attemptNo: 2, status: "SUCCEEDED" as const, observedAt: "2026-08-26T04:03:00Z", resultCategory: "PURGED" as const }],
    };
    vi.mocked(retryAdminTakedownConvergence).mockResolvedValue(retried);
    const { client, Wrapper } = wrapper();
    client.setQueryData(adminTakedownKeys.convergence(receipt.receiptId), failed);
    const { result } = renderHook(() => useRetryAdminTakedownConvergenceMutation(), { wrapper: Wrapper });

    await act(async () => { await result.current.mutateAsync(receipt.receiptId); });

    expect(retryAdminTakedownConvergence).toHaveBeenCalledWith(receipt.receiptId);
    expect(client.getQueryData(adminTakedownKeys.convergence(receipt.receiptId))).toEqual(retried);
    expect(confirmAdminPublicTakedown).not.toHaveBeenCalled();
  });
});
