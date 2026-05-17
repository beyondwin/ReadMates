import type { LoaderFunctionArgs } from "react-router-dom";
import {
  closeHostSession,
  commitHostSessionImport,
  createHostSession,
  deleteHostSession,
  fetchManualNotificationDispatches,
  fetchHostSessionDeletionPreview,
  fetchHostSessionDetail,
  previewHostSessionImport,
  publishHostSession,
  saveHostSessionAttendance,
  saveHostSessionPublication,
  updateHostSession,
} from "@/features/host/api/host-api";
import type { HostSessionEditorActions } from "@/features/host/route/host-session-editor-actions";
import { requireHostLoaderAuth } from "./host-loader-auth";
import { clubSlugFromLoaderArgs } from "@/shared/auth/member-app-loader";

export async function hostSessionEditorLoader(args: LoaderFunctionArgs) {
  const { params } = args;
  await requireHostLoaderAuth(args);
  const context = { clubSlug: clubSlugFromLoaderArgs({ params }) };

  if (!params.sessionId) {
    throw new Error("Missing host session id");
  }

  const [session, notificationDispatches] = await Promise.all([
    fetchHostSessionDetail(params.sessionId, context),
    fetchManualNotificationDispatches(context, { sessionId: params.sessionId, page: { limit: 20 } }),
  ]);

  return { session, notificationDispatches };
}

export const hostSessionEditorActions = {
  loadDeletionPreview: fetchHostSessionDeletionPreview,
  deleteSession: deleteHostSession,
  closeSession: closeHostSession,
  publishSession: publishHostSession,
  saveSession: (sessionId, request) =>
    sessionId === null ? createHostSession(request) : updateHostSession(sessionId, request),
  savePublication: saveHostSessionPublication,
  updateAttendance: saveHostSessionAttendance,
  previewSessionImport: previewHostSessionImport,
  commitSessionImport: commitHostSessionImport,
} satisfies HostSessionEditorActions;
