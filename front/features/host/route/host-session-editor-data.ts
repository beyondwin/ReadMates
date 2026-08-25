import { previewHostSessionImport } from "@/features/host/api/host-api";
import type { HostSessionEditorActions } from "@/features/host/route/host-session-editor-actions";
import type { ExplicitReadmatesApiContext } from "@/shared/api/client";

export function hostSessionEditorPreviewActions(
  context: ExplicitReadmatesApiContext,
): Pick<HostSessionEditorActions, "previewSessionImport"> {
  return {
    previewSessionImport: (sessionId, request) => previewHostSessionImport(sessionId, request, context),
  };
}
