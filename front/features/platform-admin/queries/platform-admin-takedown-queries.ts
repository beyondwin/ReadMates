import { queryOptions, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  confirmAdminPublicTakedown,
  fetchAdminTakedownConvergence,
  previewAdminPublicTakedown,
  retryAdminTakedownConvergence,
} from "../api/platform-admin-takedown-api";
import type {
  ConfirmTakedownRequest,
  ConvergenceView,
  TakedownPreviewRequest,
} from "../api/platform-admin-takedown-contracts";
import { isReadmatesTransportError } from "@/shared/api/errors";
import { initialConvergenceFromReceipt } from "../model/platform-admin-takedown-model";

export const adminTakedownKeys = {
  all: ["platform-admin", "public-takedown"] as const,
  receipt: (receiptId: string) => [...adminTakedownKeys.all, "receipt", receiptId] as const,
  convergence: (receiptId: string) => [...adminTakedownKeys.receipt(receiptId), "convergence"] as const,
} as const;

export function adminTakedownConvergenceQuery(receiptId: string | null) {
  return queryOptions({
    queryKey: receiptId ? adminTakedownKeys.convergence(receiptId) : [...adminTakedownKeys.all, "receipt", null, "convergence"],
    queryFn: () => fetchAdminTakedownConvergence(receiptId!),
    enabled: Boolean(receiptId),
    refetchInterval: (query) => (query.state.data?.status === "PENDING" ? 2_000 : false),
    refetchIntervalInBackground: false,
  });
}

export function usePreviewAdminPublicTakedownMutation() {
  return useMutation({ mutationFn: (request: TakedownPreviewRequest) => previewAdminPublicTakedown(request) });
}

export function useConfirmAdminPublicTakedownMutation() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (request: ConfirmTakedownRequest) => {
      try {
        return await confirmAdminPublicTakedown(request);
      } catch (error) {
        if (!isReadmatesTransportError(error)) throw error;
        return confirmAdminPublicTakedown(request);
      }
    },
    onSuccess: (receipt) => {
      client.setQueryData(adminTakedownKeys.convergence(receipt.receiptId), initialConvergenceFromReceipt(receipt));
      void client.invalidateQueries({ queryKey: adminTakedownKeys.convergence(receipt.receiptId), exact: true });
    },
  });
}

export function useRetryAdminTakedownConvergenceMutation() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (receiptId: string) => retryAdminTakedownConvergence(receiptId),
    onSuccess: (convergence: ConvergenceView, receiptId) => {
      client.setQueryData(adminTakedownKeys.convergence(receiptId), convergence);
    },
  });
}
