import { useLoaderData, useParams } from "react-router-dom";
import type { HostSessionDetailResponse, ManualNotificationDispatchListResponse } from "@/features/host/api/host-contracts";
import HostSessionEditor, { type HostSessionEditorLinkComponent } from "@/features/host/ui/host-session-editor";
import type { ReadmatesReturnState, ReadmatesReturnTarget } from "@/shared/routing/readmates-route-state";
import { hostSessionEditorActions } from "./host-session-editor-data";

type HostSessionEditorRouteProps = {
  returnTarget?: ReadmatesReturnTarget;
  LinkComponent?: HostSessionEditorLinkComponent;
  hostDashboardReturnTarget?: ReadmatesReturnTarget;
  readmatesReturnState?: (target: ReadmatesReturnTarget) => ReadmatesReturnState;
};

export function NewHostSessionRoute({
  returnTarget,
  LinkComponent,
  hostDashboardReturnTarget,
  readmatesReturnState,
}: HostSessionEditorRouteProps) {
  const { clubSlug } = useParams<{ clubSlug: string }>();
  return (
    <HostSessionEditor
      returnTarget={returnTarget}
      actions={hostSessionEditorActions}
      clubSlug={clubSlug}
      LinkComponent={LinkComponent}
      hostDashboardReturnTarget={hostDashboardReturnTarget}
      readmatesReturnState={readmatesReturnState}
    />
  );
}

export function EditHostSessionRoute({
  returnTarget,
  LinkComponent,
  hostDashboardReturnTarget,
  readmatesReturnState,
}: HostSessionEditorRouteProps) {
  const loaderData = useLoaderData() as HostSessionDetailResponse | {
    session: HostSessionDetailResponse;
    notificationDispatches: ManualNotificationDispatchListResponse;
  };
  const session = "session" in loaderData ? loaderData.session : loaderData;
  const notificationDispatches = "session" in loaderData ? loaderData.notificationDispatches.items : [];
  const { clubSlug } = useParams<{ clubSlug: string }>();

  return (
    <HostSessionEditor
      session={session}
      notificationDispatches={notificationDispatches}
      returnTarget={returnTarget}
      actions={hostSessionEditorActions}
      clubSlug={clubSlug}
      LinkComponent={LinkComponent}
      hostDashboardReturnTarget={hostDashboardReturnTarget}
      readmatesReturnState={readmatesReturnState}
    />
  );
}
