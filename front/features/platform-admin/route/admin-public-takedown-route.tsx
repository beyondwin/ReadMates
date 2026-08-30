import { useEffect, useRef, useState } from "react";
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
  const idempotencyKey = useRef<string | null>(null);
  const error = [preview.error, confirm.error]
    .find((candidate): candidate is Error => candidate instanceof Error)?.message ?? null;

  function purgeCommandState() {
    activeHandle.current?.unregister();
    activeHandle.current = null;
    preview.reset();
    confirm.reset();
    idempotencyKey.current = null;
    setState({ kind: "idle" });
    queryClient.removeQueries({ queryKey: adminTakedownKeys.all });
  }

  useEffect(() => subscribePlatformAdminAuthorityLoss(purgeCommandState));

  useEffect(() => () => {
    activeHandle.current?.unregister();
    activeHandle.current = null;
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
      if (activeHandle.current === handle) activeHandle.current = null;
    }
  }

  async function handleConfirm(input: { reasonCategory: TakedownReasonCategory; reason: string }) {
    if (state.kind !== "preview" && state.kind !== "confirming") return;
    if (!state.preview.confirmEnabled) return;
    const targetPreview = state.preview;
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
    activeHandle.current = handle;
    try {
      const committed = await confirm.mutateAsync(request);
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
        await handle.settle("failed");
        setState({ kind: "preview", preview: targetPreview });
      }
    } finally {
      if (activeHandle.current === handle && !confirm.isPending) activeHandle.current = null;
    }
  }

  return (
    <AdminPublicTakedownWorkbench
      canOperate
      state={state}
      pending={preview.isPending || confirm.isPending}
      error={error}
      onPreview={(target) => { void handlePreview(target); }}
      onConfirm={(input) => { void handleConfirm(input); }}
    />
  );
}
