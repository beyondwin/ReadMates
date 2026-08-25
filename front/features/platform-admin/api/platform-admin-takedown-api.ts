import { readmatesFetch } from "@/shared/api/client";
import {
  parseAdminTakedownConvergence,
  parseAdminTakedownPreview,
  parseAdminTakedownReceipt,
  type ConfirmTakedownRequest,
  type ConvergenceView,
  type TakedownPreview,
  type TakedownPreviewRequest,
  type TakedownReceipt,
} from "./platform-admin-takedown-contracts";

const ROOT = "/api/admin/public-takedowns";
const PLATFORM_CONTEXT = { clubSlug: undefined } as const;

export async function previewAdminPublicTakedown(request: TakedownPreviewRequest): Promise<TakedownPreview> {
  return parseAdminTakedownPreview(await readmatesFetch<unknown>(
    `${ROOT}/preview`,
    { method: "POST", body: JSON.stringify(request) },
    PLATFORM_CONTEXT,
  ));
}

export async function confirmAdminPublicTakedown(request: ConfirmTakedownRequest): Promise<TakedownReceipt> {
  return parseAdminTakedownReceipt(await readmatesFetch<unknown>(
    `${ROOT}/confirm`,
    { method: "POST", body: JSON.stringify(request) },
    PLATFORM_CONTEXT,
  ));
}

export async function fetchAdminTakedownConvergence(receiptId: string): Promise<ConvergenceView> {
  return parseAdminTakedownConvergence(await readmatesFetch<unknown>(
    `${ROOT}/${encodeURIComponent(receiptId)}/convergence`,
    undefined,
    PLATFORM_CONTEXT,
  ));
}

export async function retryAdminTakedownConvergence(receiptId: string): Promise<ConvergenceView> {
  return parseAdminTakedownConvergence(await readmatesFetch<unknown>(
    `${ROOT}/${encodeURIComponent(receiptId)}/convergence/retry`,
    { method: "POST" },
    PLATFORM_CONTEXT,
  ));
}
