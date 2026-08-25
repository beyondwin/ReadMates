import { useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { platformAdminSummaryQuery } from "../queries/platform-admin-queries";
import {
  adminTakedownConvergenceQuery,
  useConfirmAdminPublicTakedownMutation,
  usePreviewAdminPublicTakedownMutation,
  useRetryAdminTakedownConvergenceMutation,
} from "../queries/platform-admin-takedown-queries";
import { stateFromReceipt, type AdminTakedownState } from "../model/platform-admin-takedown-model";
import {
  parseAdminTakedownReceipt,
  type TakedownPreviewRequest,
  type TakedownReasonCategory,
  type TakedownReceipt,
} from "../api/platform-admin-takedown-contracts";
import { AdminPublicTakedownWorkbench } from "../ui/admin-public-takedown-workbench";

export function AdminPublicTakedownRoute() {
  const role = useQuery(platformAdminSummaryQuery()).data!.platformRole;
  const preview = usePreviewAdminPublicTakedownMutation();
  const confirm = useConfirmAdminPublicTakedownMutation();
  const retry = useRetryAdminTakedownConvergenceMutation();
  const [state, setState] = useState<AdminTakedownState>({ kind: "idle" });
  const [receipt, setReceipt] = useState<TakedownReceipt | null>(restoreReceipt);
  const idempotencyKey = useRef<string | null>(null);
  const convergence = useQuery(adminTakedownConvergenceQuery(receipt?.receiptId ?? null));
  const visibleState = receipt ? stateFromReceipt(receipt, convergence.data) : state;
  const error = [preview.error, confirm.error, retry.error, convergence.error]
    .find((candidate): candidate is Error => candidate instanceof Error)?.message ?? null;

  async function handlePreview(target: TakedownPreviewRequest) {
    try {
      const result = await preview.mutateAsync(target);
      idempotencyKey.current = null;
      setReceipt(null);
      globalThis.sessionStorage?.removeItem(RECEIPT_STORAGE_KEY);
      setState({ kind: "preview", preview: result });
    } catch {
      // Mutation error is rendered by the workbench.
    }
  }

  async function handleConfirm(input: { reasonCategory: TakedownReasonCategory; reason: string }) {
    if (state.kind !== "preview" && state.kind !== "confirming") return;
    const targetPreview = state.preview;
    setState({ kind: "confirming", preview: targetPreview });
    idempotencyKey.current ??= `admin-${globalThis.crypto.randomUUID()}`;
    try {
      const committed = await confirm.mutateAsync({
        previewId: targetPreview.previewId,
        reasonCategory: input.reasonCategory,
        reason: input.reason,
        idempotencyKey: idempotencyKey.current,
      });
      setReceipt(committed);
      globalThis.sessionStorage?.setItem(RECEIPT_STORAGE_KEY, JSON.stringify(committed));
    } catch {
      setState({ kind: "preview", preview: targetPreview });
    }
  }

  async function handleRetry() {
    if (!receipt) return;
    await retry.mutateAsync(receipt.receiptId);
  }

  return (
    <section aria-labelledby="admin-public-takedown-title">
      <header className="admin-club-operations__header">
        <div>
          <p className="eyebrow">Emergency public operation</p>
          <h1 id="admin-public-takedown-title" className="h1 editorial">긴급 공개 회수</h1>
          <p className="body muted">정확한 공개 대상의 원본 접근을 즉시 차단하고 별도 전파 수렴을 추적합니다.</p>
        </div>
      </header>
      <AdminPublicTakedownWorkbench
        role={role}
        state={visibleState}
        pending={preview.isPending || confirm.isPending || retry.isPending}
        error={error}
        onPreview={(target) => { void handlePreview(target); }}
        onConfirm={(input) => { void handleConfirm(input); }}
        onRetryConvergence={() => { void handleRetry(); }}
      />
    </section>
  );
}

const RECEIPT_STORAGE_KEY = "readmates:admin-public-takedown:latest-receipt";

function restoreReceipt(): TakedownReceipt | null {
  if (typeof globalThis.sessionStorage === "undefined") return null;
  const stored = globalThis.sessionStorage.getItem(RECEIPT_STORAGE_KEY);
  if (!stored) return null;
  try {
    return parseAdminTakedownReceipt(JSON.parse(stored));
  } catch {
    globalThis.sessionStorage.removeItem(RECEIPT_STORAGE_KEY);
    return null;
  }
}
