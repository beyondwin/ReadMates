import type {
  AttendanceStatus,
  HostSessionDeletionPreviewResponse,
  HostSessionDetailResponse,
  SessionImportCommitResponse,
  SessionImportPreviewResponse,
  SessionImportRequest,
} from "@/features/host/model/host-view-types";
import type {
  HostSessionPublicationRequest,
  HostSessionRequest,
} from "@/features/host/model/host-session-editor-model";

export type SaveState = "idle" | "saving" | "saved" | "error";

export type PublicationFeedback = {
  tone: "success" | "error";
  message: string;
};

export type AttendanceWriteState = {
  inFlight: boolean;
  inFlightStatus: AttendanceStatus | null;
  queuedStatus: AttendanceStatus | null;
};

export type JsonResponse<T> = Response & { json(): Promise<T> };

export type HostSessionEditorActions = {
  loadDeletionPreview: (sessionId: string) => Promise<JsonResponse<HostSessionDeletionPreviewResponse>>;
  deleteSession: (sessionId: string) => Promise<Response>;
  closeSession: (sessionId: string) => Promise<JsonResponse<HostSessionDetailResponse>>;
  publishSession: (sessionId: string) => Promise<JsonResponse<HostSessionDetailResponse>>;
  saveSession: (sessionId: string | null, request: HostSessionRequest) => Promise<Response>;
  savePublication: (sessionId: string, request: HostSessionPublicationRequest) => Promise<Response>;
  updateAttendance: (
    sessionId: string,
    attendance: Array<{ membershipId: string; attendanceStatus: AttendanceStatus }>,
  ) => Promise<Response>;
  previewSessionImport: (sessionId: string, request: SessionImportRequest) => Promise<SessionImportPreviewResponse>;
  commitSessionImport: (sessionId: string, request: SessionImportRequest) => Promise<SessionImportCommitResponse>;
};
