import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  installPlatformAdminAuthorityLossHandler,
  isPlatformAdminAuthorityLossError,
  platformAdminCapabilitiesQuery,
  platformAdminSummaryQuery,
  subscribePlatformAdminAuthorityLoss,
} from "../queries/platform-admin-queries";
import {
  adminTakedownConvergenceQuery,
  adminTakedownKeys,
  useConfirmAdminPublicTakedownMutation,
  usePreviewAdminPublicTakedownMutation,
  useRetryAdminTakedownConvergenceMutation,
} from "../queries/platform-admin-takedown-queries";
import {
  canOperatePublicTakedown,
  stateFromReceipt,
  type AdminTakedownState,
} from "../model/platform-admin-takedown-model";
import {
  parseAdminTakedownReceipt,
  type TakedownPreviewRequest,
  type TakedownReasonCategory,
  type TakedownReceipt,
} from "../api/platform-admin-takedown-contracts";
import { AdminPublicTakedownWorkbench } from "../ui/admin-public-takedown-workbench";

const RECEIPT_STORAGE_KEY = "readmates:admin-public-takedown:latest-receipt";

export function AdminPublicTakedownRoute() {
  const queryClient = useQueryClient();
  const summaryQuery = useQuery(platformAdminSummaryQuery());
  const capabilitiesQuery = useQuery(platformAdminCapabilitiesQuery());
  const canOperate = canOperatePublicTakedown(capabilitiesQuery.data);
  const authorityPending = capabilitiesQuery.isPending || summaryQuery.isPending;
  const summaryReady = summaryQuery.data != null;
  const capabilityProjectionReady = capabilitiesQuery.data != null;

  useEffect(() => {
    installPlatformAdminAuthorityLossHandler(queryClient);
    return subscribePlatformAdminAuthorityLoss(() => {
      clearStoredReceipt();
    });
  }, [queryClient]);

  useEffect(() => {
    if (!capabilityProjectionReady || canOperate) return;
    clearStoredReceipt();
    queryClient.removeQueries({ queryKey: adminTakedownKeys.all });
  }, [canOperate, capabilityProjectionReady, queryClient]);

  return (
    <section className="admin-public-takedown" aria-label="긴급 공개 회수">
      {authorityPending || !capabilityProjectionReady ? (
        <>
          <h1 className="h1 editorial">긴급 공개 회수</h1>
          <p role="status">불러오는 중</p>
        </>
      ) : !canOperate || !summaryReady ? (
        <AdminPublicTakedownWorkbench
          canOperate={false}
          state={{ kind: "idle" }}
          pending={false}
          error={null}
          onPreview={() => undefined}
          onConfirm={() => undefined}
          onRetryConvergence={() => undefined}
        />
      ) : (
        <PublicTakedownSession key="takedown-allowed" />
      )}
    </section>
  );
}

function PublicTakedownSession() {
  const queryClient = useQueryClient();
  const preview = usePreviewAdminPublicTakedownMutation();
  const confirm = useConfirmAdminPublicTakedownMutation();
  const retry = useRetryAdminTakedownConvergenceMutation();
  const [state, setState] = useState<AdminTakedownState>({ kind: "idle" });
  const [receipt, setReceipt] = useState<TakedownReceipt | null>(() => restoreReceipt());
  const idempotencyKey = useRef<string | null>(null);
  const convergence = useQuery(adminTakedownConvergenceQuery(receipt?.receiptId ?? null));
  const visibleState = receipt ? stateFromReceipt(receipt, convergence.data) : state;
  const error = [preview.error, confirm.error, retry.error, convergence.error]
    .find((candidate): candidate is Error => candidate instanceof Error)?.message ?? null;

  function purgeCommandState() {
    preview.reset();
    confirm.reset();
    retry.reset();
    idempotencyKey.current = null;
    setState({ kind: "idle" });
    setReceipt(null);
    clearStoredReceipt();
    queryClient.removeQueries({ queryKey: adminTakedownKeys.all });
  }

  async function handlePreview(target: TakedownPreviewRequest) {
    try {
      const result = await preview.mutateAsync(target);
      idempotencyKey.current = null;
      setReceipt(null);
      clearStoredReceipt();
      setState({ kind: "preview", preview: result });
    } catch (caught) {
      if (isPlatformAdminAuthorityLossError(caught)) {
        purgeCommandState();
      }
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
    } catch (caught) {
      if (isPlatformAdminAuthorityLossError(caught)) {
        purgeCommandState();
        return;
      }
      setState({ kind: "preview", preview: targetPreview });
    }
  }

  async function handleRetry() {
    if (!receipt) return;
    try {
      await retry.mutateAsync(receipt.receiptId);
    } catch (caught) {
      if (isPlatformAdminAuthorityLossError(caught)) {
        purgeCommandState();
      }
    }
  }

  return (
    <AdminPublicTakedownWorkbench
      canOperate
      state={visibleState}
      pending={preview.isPending || confirm.isPending || retry.isPending}
      error={error}
      onPreview={(target) => { void handlePreview(target); }}
      onConfirm={(input) => { void handleConfirm(input); }}
      onRetryConvergence={() => { void handleRetry(); }}
    />
  );
}

function restoreReceipt(): TakedownReceipt | null {
  if (typeof globalThis.sessionStorage === "undefined") return null;
  const stored = globalThis.sessionStorage.getItem(RECEIPT_STORAGE_KEY);
  if (!stored) return null;
  try {
    return parseAdminTakedownReceipt(JSON.parse(stored));
  } catch {
    clearStoredReceipt();
    return null;
  }
}

function clearStoredReceipt() {
  globalThis.sessionStorage?.removeItem(RECEIPT_STORAGE_KEY);
}
