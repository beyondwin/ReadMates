import { useMemo } from "react";
import { useLoaderData, useParams } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import type { HostInvitationListPage } from "@/features/host/api/host-contracts";
import { requireHostClubContext } from "@/features/host/model/host-authority-loss";
import HostInvitations from "@/features/host/ui/host-invitations";
import { createHostInvitationsActions } from "./host-invitations-data";

export function HostInvitationsRoute() {
  const invitations = useLoaderData() as HostInvitationListPage;
  const { clubSlug = "" } = useParams<{ clubSlug: string }>();
  const queryClient = useQueryClient();
  const context = requireHostClubContext(clubSlug);
  const actions = useMemo(
    () => createHostInvitationsActions(queryClient, context),
    [context, queryClient],
  );

  return <HostInvitations initialInvitations={invitations} actions={actions} />;
}
