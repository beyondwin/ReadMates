import { useMutation, type QueryClient } from "@tanstack/react-query";
import {
  confirmAdminPublicTakedown,
  previewAdminPublicTakedown,
} from "../api/platform-admin-takedown-api";
import type {
  ConfirmTakedownRequest,
  TakedownPreviewRequest,
  TakedownReceipt,
} from "../api/platform-admin-takedown-contracts";

export const adminTakedownKeys = {
  all: ["platform-admin", "public-takedown"] as const,
  receipt: (receiptId: string) => [...adminTakedownKeys.all, "receipt", receiptId] as const,
} as const;

export function usePreviewAdminPublicTakedownMutation() {
  return useMutation({
    mutationKey: adminTakedownKeys.all,
    retry: 0,
    mutationFn: (request: TakedownPreviewRequest) => previewAdminPublicTakedown(request),
  });
}

export function useConfirmAdminPublicTakedownMutation() {
  return useMutation({
    mutationKey: adminTakedownKeys.all,
    retry: 0,
    mutationFn: (request: ConfirmTakedownRequest) => confirmAdminPublicTakedown(request),
  });
}

export function publishAdminTakedownReceipt(client: QueryClient, receipt: TakedownReceipt) {
  client.setQueryData(adminTakedownKeys.receipt(receipt.receiptId), receipt);
}
