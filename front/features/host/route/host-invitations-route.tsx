import { useLoaderData } from "react-router-dom";
import type { HostInvitationListPage } from "@/features/host/api/host-contracts";
import HostInvitations from "@/features/host/ui/host-invitations";
import { hostInvitationsActions } from "./host-invitations-data";

export function HostInvitationsRoute() {
  const invitations = useLoaderData() as HostInvitationListPage;

  return <HostInvitations initialInvitations={invitations} actions={hostInvitationsActions} />;
}
