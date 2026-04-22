import { useLoaderData } from "react-router-dom";
import type { HostSessionDetailResponse } from "@/features/host/api/host-contracts";
import HostSessionEditor from "@/features/host/components/host-session-editor";
import { hostSessionEditorActions } from "./host-session-editor-data";

type HostSessionEditorReturnTarget = NonNullable<Parameters<typeof HostSessionEditor>[0]>["returnTarget"];

export function NewHostSessionRoute({ returnTarget }: { returnTarget?: HostSessionEditorReturnTarget }) {
  return <HostSessionEditor returnTarget={returnTarget} actions={hostSessionEditorActions} />;
}

export function EditHostSessionRoute({ returnTarget }: { returnTarget?: HostSessionEditorReturnTarget }) {
  const session = useLoaderData() as HostSessionDetailResponse;

  return <HostSessionEditor session={session} returnTarget={returnTarget} actions={hostSessionEditorActions} />;
}
