import type { HostSessionDetailResponse } from "@/features/host/model/host-view-types";
import type { ReadmatesReturnState, ReadmatesReturnTarget } from "@/shared/routing/readmates-route-state";

export function feedbackPreviewStateForSession(
  session: HostSessionDetailResponse | null | undefined,
  returnTarget: ReadmatesReturnTarget,
  readmatesReturnState: (target: ReadmatesReturnTarget) => ReadmatesReturnState,
) {
  if (!session) {
    return undefined;
  }

  return readmatesReturnState({
    href: `/app/host/sessions/${encodeURIComponent(session.sessionId)}/edit`,
    label: "세션 문서로",
    state: readmatesReturnState(returnTarget),
  });
}

export function feedbackDocumentUploadStatus(feedbackDocument: HostSessionDetailResponse["feedbackDocument"]) {
  return {
    uploaded: feedbackDocument.uploaded,
    fileName: feedbackDocument.fileName,
  };
}
