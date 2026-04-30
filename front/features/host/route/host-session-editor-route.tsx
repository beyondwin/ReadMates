import { useLoaderData } from "react-router-dom";
import type { HostSessionDetailResponse } from "@/features/host/api/host-contracts";
import HostSessionEditor, { type HostSessionEditorLinkComponent } from "@/features/host/ui/host-session-editor";
import { hostSessionEditorActions } from "./host-session-editor-data";

type HostSessionEditorReturnTarget = NonNullable<Parameters<typeof HostSessionEditor>[0]>["returnTarget"];
type ReadmatesReturnState = {
  readmatesReturnTo: string;
  readmatesReturnLabel: string;
  readmatesReturnState?: ReadmatesReturnState;
};
type ReadmatesReturnTarget = NonNullable<Parameters<typeof HostSessionEditor>[0]>["hostDashboardReturnTarget"];
type HostSessionEditorRouteProps = {
  returnTarget?: HostSessionEditorReturnTarget;
  LinkComponent?: HostSessionEditorLinkComponent;
  hostDashboardReturnTarget?: ReadmatesReturnTarget;
  readmatesReturnState?: (target: NonNullable<ReadmatesReturnTarget>) => ReadmatesReturnState;
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
