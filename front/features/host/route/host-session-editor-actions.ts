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

export type HostSessionChangeReceiptListener = (
  receipt: HostSessionChangeReceipt,
  description: string,
  sessionState?: HostSessionState,
) => void;

function captureReceipt(
  receipt: HostSessionChangeReceipt | null | undefined,
  description: string,
  onReceipt: HostSessionChangeReceiptListener,
  sessionState?: HostSessionState,
) {
  if (receipt?.undoAvailable) {
    onReceipt(receipt, description, sessionState);
  }
}

async function captureLifecycleResult(
  result: Promise<HostSessionLifecycleResult>,
  kind: SessionLifecycleConfirmKind,
  onReceipt: HostSessionChangeReceiptListener,
) {
  const resolved = await result;
  if (resolved.ok) {
    captureReceipt(
      resolved.session.changeReceipt,
      lifecycleConfirmCopy(kind).successFlash,
      onReceipt,
      resolved.session.state,
    );
  }
  return resolved;
}

export function wrapHostSessionEditorActionsForUndo(
  actions: HostSessionEditorActions,
  onReceipt: HostSessionChangeReceiptListener,
): HostSessionEditorActions {
  return {
    ...actions,
    openSession: (sessionId) =>
      captureLifecycleResult(actions.openSession(sessionId), "open", onReceipt),
    closeSession: (sessionId) =>
      captureLifecycleResult(actions.closeSession(sessionId), "close", onReceipt),
    publishSession: (sessionId) =>
      captureLifecycleResult(actions.publishSession(sessionId), "publish", onReceipt),
    reopenSession: (sessionId, request) =>
      captureLifecycleResult(actions.reopenSession(sessionId, request), "reopen", onReceipt),
    unpublishSession: (sessionId, request) =>
      captureLifecycleResult(actions.unpublishSession(sessionId, request), "unpublish", onReceipt),
    returnSessionToDraft: (sessionId, request) =>
      captureLifecycleResult(
        actions.returnSessionToDraft(sessionId, request),
        "return-to-draft",
        onReceipt,
      ),
    saveSession: async (sessionId, request) => {
      const response = await actions.saveSession(sessionId, request);
      if (response.ok && sessionId) {
        const body = await readResponseJson(response);
        captureReceipt(
          parseOptionalHostSessionChangeReceipt(body),
          hostSessionChangeUndoDescription("BASIC_INFO"),
          onReceipt,
        );
      }
      return response;
    },
    updateAttendance: async (sessionId, attendance) => {
      const result = await actions.updateAttendance(sessionId, attendance);
      captureReceipt(
        result.changeReceipt,
        hostSessionChangeUndoDescription("ATTENDANCE"),
        onReceipt,
      );
      return result;
    },
  };
}

async function readResponseJson(response: Response): Promise<unknown> {
  try {
    return await response.clone().json();
  } catch {
    return null;
  }
}
