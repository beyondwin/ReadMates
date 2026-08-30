import { describe, expect, it, vi } from "vitest";
import type { HostSessionEditorActions } from "./host-session-editor-actions";
import {
  publishHostSessionEditorReceipt,
  wrapHostSessionEditorActionsForUndo,
} from "./host-session-editor-actions";

function actions(response: Response): HostSessionEditorActions {
  return {
    loadDeletionPreview: vi.fn(), deleteSession: vi.fn(), restoreSession: vi.fn(),
    openSession: vi.fn(), closeSession: vi.fn(), publishSession: vi.fn(),
    reopenSession: vi.fn(), unpublishSession: vi.fn(), returnSessionToDraft: vi.fn(),
    saveSession: vi.fn().mockResolvedValue(response), readCreatedSessionId: vi.fn(),
    updateAttendance: vi.fn(), previewSessionImport: vi.fn(), commitSessionImport: vi.fn(),
    saveSessionAccessScope: vi.fn(),
  } as unknown as HostSessionEditorActions;
}

describe("host session editor receipt publication fence", () => {
  it("keeps raw execution observation-only and publishes a receipt explicitly", async () => {
    const receipt = { changeId: "change-1", kind: "BASIC_INFO", undoAvailable: true } as const;
    const response = new Response(JSON.stringify({ changeReceipt: receipt }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
    const raw = actions(response);
    const listener = vi.fn();

    await raw.saveSession("session-1", {} as never);
    expect(listener).not.toHaveBeenCalled();

    publishHostSessionEditorReceipt(receipt, "기본 정보 변경", listener);
    expect(listener).toHaveBeenCalledOnce();
  });

  it("publishes the accepted action receipt once and never publishes failed responses", async () => {
    const accepted = actions(new Response(JSON.stringify({
      changeReceipt: { changeId: "change-1", kind: "BASIC_INFO", undoAvailable: true },
    }), { status: 200, headers: { "Content-Type": "application/json" } }));
    const failed = actions(new Response(null, { status: 409 }));
    const acceptedListener = vi.fn();
    const failedListener = vi.fn();

    await wrapHostSessionEditorActionsForUndo(accepted, acceptedListener).saveSession("session-1", {} as never);
    await wrapHostSessionEditorActionsForUndo(failed, failedListener).saveSession("session-1", {} as never);

    expect(acceptedListener).toHaveBeenCalledOnce();
    expect(failedListener).not.toHaveBeenCalled();
  });

  it("keeps the receipt callback inside the registered owner fence", async () => {
    const accepted = actions(new Response(JSON.stringify({
      changeReceipt: { changeId: "change-1", kind: "BASIC_INFO", undoAvailable: true },
    }), { status: 200, headers: { "Content-Type": "application/json" } }));
    const listener = vi.fn();
    const obsoleteExecutor = vi.fn(async <T,>(_operationId: string, request: () => Promise<T>) => request());

    await wrapHostSessionEditorActionsForUndo(accepted, listener, obsoleteExecutor).saveSession("session-1", {} as never);

    expect(obsoleteExecutor).toHaveBeenCalledOnce();
    expect(listener).not.toHaveBeenCalled();
  });
});
