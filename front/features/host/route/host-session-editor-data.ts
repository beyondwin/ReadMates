import type { LoaderFunctionArgs } from "react-router-dom";
import {
  createHostSession,
  deleteHostSession,
  fetchHostSessionDeletionPreview,
  fetchHostSessionDetail,
  saveHostSessionAttendance,
  saveHostSessionPublication,
  updateHostSession,
  uploadHostSessionFeedbackDocument,
} from "@/features/host/api/host-api";
import type { HostSessionEditorActions } from "@/features/host/components/host-session-editor";
import { requireHostLoaderAuth } from "./host-loader-auth";

export async function hostSessionEditorLoader({ params }: LoaderFunctionArgs) {
  await requireHostLoaderAuth();

  if (!params.sessionId) {
    throw new Error("Missing host session id");
  }

  return fetchHostSessionDetail(params.sessionId);
}

export const hostSessionEditorActions = {
  loadDeletionPreview: fetchHostSessionDeletionPreview,
  deleteSession: deleteHostSession,
  saveSession: (sessionId, request) =>
    sessionId === null ? createHostSession(request) : updateHostSession(sessionId, request),
  savePublication: saveHostSessionPublication,
  updateAttendance: saveHostSessionAttendance,
  uploadFeedbackDocument: uploadHostSessionFeedbackDocument,
} satisfies HostSessionEditorActions;
