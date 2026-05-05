import { useLoaderData } from "react-router-dom";
import type { HostSessionDetailResponse } from "@/features/host/api/host-contracts";
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
  return (
    <HostSessionEditor
      returnTarget={returnTarget}
      actions={hostSessionEditorActions}
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
  const session = useLoaderData() as HostSessionDetailResponse;

  return (
    <HostSessionEditor
      session={session}
      returnTarget={returnTarget}
      actions={hostSessionEditorActions}
      LinkComponent={LinkComponent}
      hostDashboardReturnTarget={hostDashboardReturnTarget}
      readmatesReturnState={readmatesReturnState}
    />
  );
}
