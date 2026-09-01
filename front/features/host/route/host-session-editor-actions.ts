import type {
  AttendanceStatus,
  HostAttendanceResponse,
  HostSessionDeletionPreviewResponse,
  HostSessionDeletionResponse,
  HostSessionDetailResponse,
  SessionImportCommitResponse,
  SessionImportPreviewResponse,
  SessionImportRequest,
} from "@/features/host/api/host-contracts";
import {
  parseOptionalHostSessionChangeReceipt,
  type HostSessionChangeReceipt,
} from "@/features/host/api/host-session-recovery-contracts";
import type { HostSessionReverseRequest } from "@/features/host/api/host-session-record-contracts";
import { hostSessionChangeUndoDescription } from "@/features/host/model/host-session-editor-view-model";
import type { HostSessionRequest, HostSessionState } from "@/features/host/model/host-session-editor-model";
import {
  lifecycleConfirmCopy,
  type HostSessionLifecycleResult,
  type SessionLifecycleConfirmKind,
} from "@/features/host/model/host-session-lifecycle-model";
import type { SessionAccessScope } from "@/features/host/model/session-exposure-model";
import { readHostResponseJson } from "@/shared/api/host-authority-event";

export type HostSessionEditorActions = {
  loadDeletionPreview: (sessionId: string) => Promise<HostSessionDeletionPreviewResponse>;
  deleteSession: (sessionId: string) => Promise<HostSessionDeletionResponse>;
  restoreSession: (sessionId: string) => Promise<HostSessionDetailResponse>;
  openSession: (sessionId: string) => Promise<HostSessionLifecycleResult>;
  closeSession: (sessionId: string) => Promise<HostSessionLifecycleResult>;
  publishSession: (sessionId: string) => Promise<HostSessionLifecycleResult>;
  reopenSession: (sessionId: string, request: HostSessionReverseRequest) => Promise<HostSessionLifecycleResult>;
  unpublishSession: (sessionId: string, request: HostSessionReverseRequest) => Promise<HostSessionLifecycleResult>;
  returnSessionToDraft: (sessionId: string, request: HostSessionReverseRequest) => Promise<HostSessionLifecycleResult>;
  saveSession: (sessionId: string | null, request: HostSessionRequest) => Promise<Response>;
  reloadSession: (sessionId: string) => Promise<HostSessionDetailResponse>;
  readCreatedSessionId: (response: Response) => Promise<string>;
  updateAttendance: (
    sessionId: string,
    attendance: Array<{ membershipId: string; attendanceStatus: AttendanceStatus }>,
  ) => Promise<HostAttendanceResponse>;
  previewSessionImport: (sessionId: string, request: SessionImportRequest) => Promise<SessionImportPreviewResponse>;
  commitSessionImport: (sessionId: string, request: SessionImportRequest) => Promise<SessionImportCommitResponse>;
  saveSessionAccessScope: (
    sessionId: string,
    request: { accessScope: SessionAccessScope },
  ) => Promise<unknown>;
};

export async function readCreatedHostSessionId(response: Response): Promise<string> {
  const body = await readHostResponseJson<{ sessionId?: unknown }>(response);
  if (typeof body.sessionId !== "string" || !body.sessionId) {
    throw new Error("HOST_SESSION_ID_REQUIRED");
  }
  return body.sessionId;
}

export type HostSessionChangeReceiptListener = (
  receipt: HostSessionChangeReceipt,
  description: string,
  sessionState?: HostSessionState,
) => void;

export type HostSessionEditorActionExecutor = <T>(
  operationId: string,
  request: () => Promise<T>,
  prepareReceipt: (result: T) => (() => void | Promise<void>) | Promise<() => void | Promise<void>>,
) => Promise<T>;

export function publishHostSessionEditorReceipt(
  receipt: HostSessionChangeReceipt | null | undefined,
  description: string,
  onReceipt: HostSessionChangeReceiptListener,
  sessionState?: HostSessionState,
) {
  if (receipt?.undoAvailable) {
    onReceipt(receipt, description, sessionState);
  }
}

async function prepareLifecycleReceipt(
  result: Promise<HostSessionLifecycleResult>,
  kind: SessionLifecycleConfirmKind,
  onReceipt: HostSessionChangeReceiptListener,
) {
  const resolved = await result;
  return () => {
    if (!resolved.ok) return;
    publishHostSessionEditorReceipt(
      resolved.session.changeReceipt,
      lifecycleConfirmCopy(kind).successFlash,
      onReceipt,
      resolved.session.state,
    );
  };
}

export function wrapHostSessionEditorActionsForUndo(
  actions: HostSessionEditorActions,
  onReceipt: HostSessionChangeReceiptListener,
  execute: HostSessionEditorActionExecutor,
): HostSessionEditorActions {
  if (!execute) throw new Error("HOST_SESSION_EDITOR_ACTION_EXECUTOR_REQUIRED");
  return {
    ...actions,
    openSession: (sessionId) =>
      execute(`host-session-editor:open:${sessionId}`, () => actions.openSession(sessionId), (result) => prepareLifecycleReceipt(Promise.resolve(result), "open", onReceipt)),
    closeSession: (sessionId) =>
      execute(`host-session-editor:close:${sessionId}`, () => actions.closeSession(sessionId), (result) => prepareLifecycleReceipt(Promise.resolve(result), "close", onReceipt)),
    publishSession: (sessionId) =>
      execute(`host-session-editor:publish:${sessionId}`, () => actions.publishSession(sessionId), (result) => prepareLifecycleReceipt(Promise.resolve(result), "publish", onReceipt)),
    reopenSession: (sessionId, request) =>
      execute(`host-session-editor:reopen:${sessionId}`, () => actions.reopenSession(sessionId, request), (result) => prepareLifecycleReceipt(Promise.resolve(result), "reopen", onReceipt)),
    unpublishSession: (sessionId, request) =>
      execute(`host-session-editor:unpublish:${sessionId}`, () => actions.unpublishSession(sessionId, request), (result) => prepareLifecycleReceipt(Promise.resolve(result), "unpublish", onReceipt)),
    returnSessionToDraft: (sessionId, request) =>
      execute(`host-session-editor:return-to-draft:${sessionId}`, () => actions.returnSessionToDraft(sessionId, request), (result) => prepareLifecycleReceipt(Promise.resolve(result), "return-to-draft", onReceipt)),
    saveSession: (sessionId, request) => execute(`host-session-editor:save:${sessionId ?? "new"}`, () => actions.saveSession(sessionId, request), async (response) => {
      if (response.ok && sessionId) {
        const body = await readResponseJson(response);
        const receipt = parseOptionalHostSessionChangeReceipt(body);
        return () => publishHostSessionEditorReceipt(
          receipt, hostSessionChangeUndoDescription("BASIC_INFO"), onReceipt,
        );
      }
      return () => undefined;
    }),
    updateAttendance: (sessionId, attendance) => execute(`host-session-editor:attendance:${sessionId}`, () => actions.updateAttendance(sessionId, attendance), (result) => () => {
      publishHostSessionEditorReceipt(
        result.changeReceipt,
        hostSessionChangeUndoDescription("ATTENDANCE"),
        onReceipt,
      );
    }),
  };
}

async function readResponseJson(response: Response): Promise<unknown> {
  try {
    return await readHostResponseJson(response.clone());
  } catch {
    return null;
  }
}
