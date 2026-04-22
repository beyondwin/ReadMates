import { useLoaderData } from "react-router-dom";
import type { HostInvitationListItem } from "@/features/host/api/host-contracts";
import HostInvitations from "@/features/host/components/host-invitations";
import { hostInvitationsActions } from "./host-invitations-data";

export function HostInvitationsRoute() {
  const invitations = useLoaderData() as HostInvitationListItem[];

  return <HostInvitations initialInvitations={invitations} actions={hostInvitationsActions} />;
}
