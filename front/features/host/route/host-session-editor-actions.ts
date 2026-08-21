import type {
  AttendanceStatus,
  HostSessionDeletionPreviewResponse,
  HostSessionDeletionResponse,
  SessionImportCommitResponse,
  SessionImportPreviewResponse,
  SessionImportRequest,
} from "@/features/host/api/host-contracts";
import type { HostSessionReverseRequest } from "@/features/host/api/host-session-record-contracts";
import type { HostSessionRequest } from "@/features/host/model/host-session-editor-model";
import type { HostSessionLifecycleResult } from "@/features/host/model/host-session-lifecycle-model";
import type { SessionAccessScope } from "@/features/host/model/session-exposure-model";

export type HostSessionEditorActions = {
  loadDeletionPreview: (sessionId: string) => Promise<HostSessionDeletionPreviewResponse>;
  deleteSession: (sessionId: string) => Promise<HostSessionDeletionResponse>;
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
  ) => Promise<Response>;
  previewSessionImport: (sessionId: string, request: SessionImportRequest) => Promise<SessionImportPreviewResponse>;
  commitSessionImport: (sessionId: string, request: SessionImportRequest) => Promise<SessionImportCommitResponse>;
  saveSessionAccessScope: (
    sessionId: string,
    request: { accessScope: SessionAccessScope },
  ) => Promise<unknown>;
};
