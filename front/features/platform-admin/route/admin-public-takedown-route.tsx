import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { PendingHandle } from "@/shared/model/global-space";
import { useSpaceTransitionSafetyRegistration } from "@/shared/ui/space-transition-safety-context";
import { isReadmatesTransportError } from "@/shared/api/errors";
import {
  installPlatformAdminAuthorityLossHandler,
  isPlatformAdminAuthorityLossError,
  platformAdminCapabilitiesQuery,
  platformAdminSummaryQuery,
  subscribePlatformAdminAuthorityLoss,
} from "../queries/platform-admin-queries";
import {
  adminTakedownKeys,
  publishAdminTakedownReceipt,
  useConfirmAdminPublicTakedownMutation,
  usePreviewAdminPublicTakedownMutation,
} from "../queries/platform-admin-takedown-queries";
import {
  canOperatePublicTakedown,
  stateFromReceipt,
  type AdminTakedownState,
} from "../model/platform-admin-takedown-model";
import type {
  ConfirmTakedownRequest,
  TakedownPreviewRequest,
  TakedownReasonCategory,
} from "../api/platform-admin-takedown-contracts";
import { confirmAdminPublicTakedown } from "../api/platform-admin-takedown-api";
import { AdminPublicTakedownWorkbench } from "../ui/admin-public-takedown-workbench";
import { createAdminTakedownReceiptCapsule } from "./admin-public-takedown-receipt-capsule";

const OWNER_ID = "platform-admin-public-takedown";

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
  }, [queryClient]);

  useEffect(() => {
    if (!capabilityProjectionReady || canOperate) return;
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
        />
      ) : (
        <PublicTakedownSession key="takedown-allowed" />
      )}
    </section>
  );
}

function PublicTakedownSession() {
  const queryClient = useQueryClient();
  const registration = useSpaceTransitionSafetyRegistration();
  const preview = usePreviewAdminPublicTakedownMutation();
  const confirm = useConfirmAdminPublicTakedownMutation();
  const [state, setState] = useState<AdminTakedownState>({ kind: "idle" });
  const activeHandle = useRef<PendingHandle | null>(null);
  const activeHandles = useRef(new Set<PendingHandle>());
  const confirmLocked = useRef(false);
  const mounted = useRef(true);
  const idempotencyKey = useRef<string | null>(null);
  const error = [preview.error, confirm.error]
    .find((candidate): candidate is Error => candidate instanceof Error)?.message ?? null;

  const purgeCommandState = useCallback(() => {
    for (const handle of activeHandles.current) handle.unregister();
    activeHandles.current.clear();
    activeHandle.current = null;
    confirmLocked.current = false;
    preview.reset();
    confirm.reset();
    idempotencyKey.current = null;
    setState({ kind: "idle" });
    queryClient.removeQueries({ queryKey: adminTakedownKeys.all });
  }, [confirm, preview, queryClient]);

  useEffect(() => subscribePlatformAdminAuthorityLoss(purgeCommandState), [purgeCommandState]);

  useEffect(() => {
    const handles = activeHandles.current;
    mounted.current = true;
    return () => {
      mounted.current = false;
      for (const handle of handles) handle.unregister();
      handles.clear();
      activeHandle.current = null;
    };
  }, []);

  async function handlePreview(target: TakedownPreviewRequest) {
    const operationId = `takedown-preview-${globalThis.crypto.randomUUID()}`;
    const handle = registration.beginPending({
      ownerId: OWNER_ID,
      operationId,
      recovery: {
        kind: "authoritative-history",
        operationId,
        reconcile: async () => ({ operationId, outcome: "still-unknown" }),
      },
    });
    activeHandles.current.add(handle);
    activeHandle.current = handle;
    try {
      const result = await preview.mutateAsync(target);
      if (await handle.settle("succeeded") === "accepted") {
        handle.publishAccepted({
          surface: "ui",
          publish: () => {
            idempotencyKey.current = null;
            setState({ kind: "preview", preview: result });
          },
        });
      }
    } catch (caught) {
      await handle.settle("failed");
      if (isPlatformAdminAuthorityLossError(caught)) purgeCommandState();
    } finally {
      activeHandles.current.delete(handle);
      if (activeHandle.current === handle) activeHandle.current = null;
    }
  }

  async function handleConfirm(input: { reasonCategory: TakedownReasonCategory; reason: string }) {
    if (state.kind !== "preview" || confirmLocked.current) return;
    if (!state.preview.confirmEnabled) return;
    const targetPreview = state.preview;
    confirmLocked.current = true;
    setState({ kind: "confirming", preview: targetPreview });
    idempotencyKey.current ??= `admin-${globalThis.crypto.randomUUID()}`;
    const request: ConfirmTakedownRequest = {
      previewId: targetPreview.previewId,
      reasonCategory: input.reasonCategory,
      reason: input.reason,
      idempotencyKey: idempotencyKey.current,
    };
    const capsule = createAdminTakedownReceiptCapsule({
      request,
      replayLookup: confirmAdminPublicTakedown,
    });
    const handle = registration.beginPending({
      ownerId: OWNER_ID,
      operationId: request.idempotencyKey,
      recovery: { kind: "receipt", capsule },
    });
    activeHandles.current.add(handle);
    activeHandle.current = handle;
    let retainForRecovery = false;
    try {
      const committed = await confirm.mutateAsync(request);
      if (!mounted.current) {
        handle.unregister();
        return;
      }
      if (await handle.settle("succeeded") !== "accepted") return;
      handle.publishAccepted({
        surface: "cache",
        publish: () => publishAdminTakedownReceipt(queryClient, committed),
      });
      handle.publishAccepted({
        surface: "ui",
        publish: () => setState(stateFromReceipt(committed)),
      });
    } catch (caught) {
      if (isPlatformAdminAuthorityLossError(caught)) {
        purgeCommandState();
        return;
      }
      if (!isReadmatesTransportError(caught)) {
        if (await handle.settle("failed") === "accepted") {
          handle.publishAccepted({
            surface: "errorCopy",
            publish: () => setState({ kind: "preview", preview: targetPreview }),
          });
        }
        confirmLocked.current = false;
      } else {
        retainForRecovery = true;
      }
    } finally {
      if (!retainForRecovery) {
        activeHandles.current.delete(handle);
        if (activeHandle.current === handle) activeHandle.current = null;
        confirmLocked.current = false;
      }
    }
  }

  return (
    <AdminPublicTakedownWorkbench
      canOperate
      state={state}
      pending={preview.isPending || confirm.isPending || state.kind === "confirming"}
      error={error}
      onPreview={(target) => { void handlePreview(target); }}
      onConfirm={(input) => { void handleConfirm(input); }}
    />
  );
}
