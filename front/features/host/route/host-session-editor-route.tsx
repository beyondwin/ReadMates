import { useLoaderData } from "react-router-dom";
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
import type { HostSessionDetailResponse } from "@/features/host/api/host-contracts";
import HostSessionEditor, {
  type HostSessionEditorActions,
} from "@/features/host/components/host-session-editor";

type HostSessionEditorReturnTarget = NonNullable<Parameters<typeof HostSessionEditor>[0]>["returnTarget"];

export async function hostSessionEditorLoader({ params }: { params: { sessionId?: string } }) {
  if (!params.sessionId) {
    throw new Error("Missing host session id");
  }

  return fetchHostSessionDetail(params.sessionId);
}

const hostSessionEditorActions = {
  loadDeletionPreview: fetchHostSessionDeletionPreview,
  deleteSession: deleteHostSession,
  saveSession: (sessionId, request) =>
    sessionId === null ? createHostSession(request) : updateHostSession(sessionId, request),
  savePublication: saveHostSessionPublication,
  updateAttendance: saveHostSessionAttendance,
  uploadFeedbackDocument: uploadHostSessionFeedbackDocument,
} satisfies HostSessionEditorActions;

export function NewHostSessionRoute({ returnTarget }: { returnTarget?: HostSessionEditorReturnTarget }) {
  return <HostSessionEditor returnTarget={returnTarget} actions={hostSessionEditorActions} />;
}

export function EditHostSessionRoute({ returnTarget }: { returnTarget?: HostSessionEditorReturnTarget }) {
  const session = useLoaderData() as HostSessionDetailResponse;

  return <HostSessionEditor session={session} returnTarget={returnTarget} actions={hostSessionEditorActions} />;
}
