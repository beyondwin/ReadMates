import { useMemo } from "react";
import { useLoaderData } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import type { HostInvitationListPage } from "@/features/host/api/host-contracts";
import HostInvitations from "@/features/host/ui/host-invitations";
import { createHostInvitationsActions } from "./host-invitations-data";

export function HostInvitationsRoute() {
  const invitations = useLoaderData() as HostInvitationListPage;
  const queryClient = useQueryClient();
  const actions = useMemo(() => createHostInvitationsActions(queryClient), [queryClient]);

  return <HostInvitations initialInvitations={invitations} actions={actions} />;
}
