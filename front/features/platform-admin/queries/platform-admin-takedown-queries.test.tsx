import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import type { PropsWithChildren } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import receiptFixture from "../../../tests/unit/__fixtures__/platform-admin-takedown-receipt.server.json";
import { parseAdminTakedownReceipt } from "../api/platform-admin-takedown-contracts";

vi.mock("@/features/platform-admin/api/platform-admin-takedown-api", () => ({
  confirmAdminPublicTakedown: vi.fn(),
  previewAdminPublicTakedown: vi.fn(),
}));

import {
  confirmAdminPublicTakedown,
  previewAdminPublicTakedown,
} from "@/features/platform-admin/api/platform-admin-takedown-api";
import {
  adminTakedownKeys,
  publishAdminTakedownReceipt,
  useConfirmAdminPublicTakedownMutation,
  usePreviewAdminPublicTakedownMutation,
} from "./platform-admin-takedown-queries";

const receipt = parseAdminTakedownReceipt(receiptFixture);
const request = {
  previewId: "40000000-0000-4000-8000-000000000004",
  reasonCategory: "PRIVATE_DATA" as const,
  reason: "confirmed",
  idempotencyKey: "admin-fixed-key",
};

function wrapper() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: 3 } },
  });
  function Wrapper({ children }: PropsWithChildren) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  }
  return { client, Wrapper };
}

beforeEach(() => vi.clearAllMocks());

describe("platform-admin takedown queries", () => {
  it("observes one confirm request and performs no automatic publication", async () => {
    vi.mocked(confirmAdminPublicTakedown).mockResolvedValue(receipt);
    const { client, Wrapper } = wrapper();
    const setQueryData = vi.spyOn(client, "setQueryData");
    const invalidateQueries = vi.spyOn(client, "invalidateQueries");
    const { result } = renderHook(() => useConfirmAdminPublicTakedownMutation(), { wrapper: Wrapper });

    await act(async () => { await result.current.mutateAsync(request); });

    expect(confirmAdminPublicTakedown).toHaveBeenCalledTimes(1);
    expect(confirmAdminPublicTakedown).toHaveBeenCalledWith(request);
    expect(setQueryData).not.toHaveBeenCalled();
    expect(invalidateQueries).not.toHaveBeenCalled();
    expect(client.getQueryData(adminTakedownKeys.receipt(receipt.receiptId))).toBeUndefined();
  });

  it("publishes the accepted receipt only through the explicit publisher", () => {
    const { client } = wrapper();
    publishAdminTakedownReceipt(client, receipt);
    expect(client.getQueryData(adminTakedownKeys.receipt(receipt.receiptId))).toEqual(receipt);
  });

  it("keeps preview execution observation-only and disables mutation retries", async () => {
    vi.mocked(previewAdminPublicTakedown).mockResolvedValue({
      schema: "admin.public_takedown.preview.v1",
      previewId: request.previewId,
      expiresAt: "2026-08-30T04:05:00Z",
      clubId: receipt.clubId,
      sessionId: receipt.sessionId,
      publicationId: receipt.publicationId,
      targetGeneration: 7,
      currentSurfaces: [],
      confirmEnabled: false,
      activationBoundary: "PROTECTED_CACHE_SAFETY_EVIDENCE_REQUIRED",
      remoteCopyLimitation: receipt.remoteCopyLimitation,
    });
    const { client, Wrapper } = wrapper();
    const setQueryData = vi.spyOn(client, "setQueryData");
    const { result } = renderHook(() => usePreviewAdminPublicTakedownMutation(), { wrapper: Wrapper });

    await act(async () => {
      await result.current.mutateAsync({ clubId: receipt.clubId, sessionId: receipt.sessionId, publicationId: receipt.publicationId });
    });

    const mutation = client.getMutationCache().find({ mutationKey: adminTakedownKeys.all });
    expect(mutation?.options.retry).toBe(0);
    expect(previewAdminPublicTakedown).toHaveBeenCalledTimes(1);
    expect(setQueryData).not.toHaveBeenCalled();
  });
});
