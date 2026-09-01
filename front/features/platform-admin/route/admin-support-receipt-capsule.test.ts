import { describe, expect, it, vi } from "vitest";
import {
  createGlobalSpaceTransitionCoordinator,
  createRetiredReceiptCapsuleRegistry,
} from "@/src/app/global-space-transition";
import type { AdminSupportGrantCreateConfirmRequest } from "@/features/platform-admin/model/platform-admin-support-model";
import { createAdminSupportReceiptCapsule } from "./admin-support-receipt-capsule";

const request: AdminSupportGrantCreateConfirmRequest = {
  clubId: "00000000-0000-4000-8000-000000006401",
  granteeSubjectId: "00000000-0000-4000-8000-000000006402",
  scope: "HOST_SUPPORT_READ",
  expiresAt: "2026-08-25T12:00:00Z",
  reasonCategory: "MEMBER_ASSISTANCE",
  note: "synthetic support reason",
  previewId: "00000000-0000-4000-8000-000000006403",
  idempotencyKey: "support-intent-1",
  confirmed: true,
};

describe("admin support receipt capsule", () => {
  it("reconciles a normal unmount once with the exact retained request identity", async () => {
    const registry = createRetiredReceiptCapsuleRegistry();
    const coordinator = createGlobalSpaceTransitionCoordinator({ registry });
    const replayLookup = vi.fn().mockResolvedValue({
      receiptId: "00000000-0000-4000-8000-000000006404",
      previewId: request.previewId,
      commandType: "CREATE" as const,
      grantId: "00000000-0000-4000-8000-000000006405",
      clubId: request.clubId,
      scope: request.scope,
      grantExpiresAt: request.expiresAt,
      reasonCategory: request.reasonCategory,
      notePresent: true,
      beforeStatus: "ABSENT",
      afterStatus: "ACTIVE",
      outcome: "SUCCEEDED",
      createdAt: "2026-08-25T10:00:00Z",
    });
    const operationId = `admin-support-create:${request.idempotencyKey}`;
    const capsule = createAdminSupportReceiptCapsule({ operationId, request, replayLookup });
    const handle = coordinator.beginPending({
      ownerId: "admin-support-command",
      operationId,
      recovery: { kind: "receipt", capsule },
    });

    handle.unregister();
    await expect(handle.reconcile()).resolves.toEqual({ operationId, outcome: "succeeded" });

    expect(replayLookup).toHaveBeenCalledOnce();
    expect(replayLookup).toHaveBeenCalledWith(request);
    expect(capsule.replayCount()).toBe(1);
    expect(capsule.retainedRequest()).toBeNull();
    expect(registry.size()).toBe(0);
  });
});
