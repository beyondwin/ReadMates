import type { HostSessionDetailResponse } from "@/features/host/model/host-view-types";
import type { ReadmatesReturnState, ReadmatesReturnTarget } from "@/shared/routing/readmates-route-state";

export function feedbackPreviewStateForSession(
  session: Pick<HostSessionDetailResponse, "sessionId"> | null | undefined,
  returnTarget: ReadmatesReturnTarget,
  readmatesReturnState: (target: ReadmatesReturnTarget) => ReadmatesReturnState,
  clubSlug?: string,
) {
  if (!session) {
    return undefined;
  }

  const appBasePath = clubSlug ? `/clubs/${encodeURIComponent(clubSlug)}/app` : "/app";
  return readmatesReturnState({
    href: `${appBasePath}/host/sessions/${encodeURIComponent(session.sessionId)}`,
    label: "모임 문서로",
    state: readmatesReturnState(returnTarget),
  });
}

export function feedbackDocumentUploadStatus(feedbackDocument: HostSessionDetailResponse["feedbackDocument"]) {
  return {
    uploaded: feedbackDocument.uploaded,
    fileName: feedbackDocument.fileName,
  };
}
