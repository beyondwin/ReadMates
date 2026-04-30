import type {
  AttendanceStatus,
  FeedbackDocumentResponse,
  HostSessionDeletionPreviewResponse,
  HostSessionDetailResponse,
} from "@/features/host/api/host-contracts";
import type {
  HostSessionPublicationRequest,
  HostSessionRequest,
} from "@/features/host/model/host-session-editor-model";

type JsonResponse<T> = Response & { json(): Promise<T> };

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
  uploadFeedbackDocument: (sessionId: string, formData: FormData) => Promise<JsonResponse<FeedbackDocumentResponse>>;
};
