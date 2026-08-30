/* eslint-disable react-refresh/only-export-components -- route module exports its owner adapter for exact transition tests */
import { useMemo } from "react";
import { useLoaderData, useParams } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import type { HostInvitationListPage } from "@/features/host/api/host-contracts";
import { requireHostClubContext } from "@/features/host/model/host-authority-loss";
import HostInvitations from "@/features/host/ui/host-invitations";
import { createHostInvitationsActions } from "./host-invitations-data";
import type { HostInvitationsActions } from "@/features/host/model/host-invitation-actions";
import { TransitionOwnerObsoleteError, useTransitionSafetyOwner } from "@/shared/ui/use-transition-safety-owner";

export function registerHostInvitationActions(
  actions: HostInvitationsActions,
  owner: ReturnType<typeof useTransitionSafetyOwner>,
): HostInvitationsActions {
  const reconcile = async (operationId: string) => {
    try {
      await actions.listInvitations({ limit: 50 });
    } catch {
      // Detached observation remains conservative when the list is unavailable.
    }
    return { operationId, outcome: "still-unknown" as const };
  };
  const execute = async <T,>(operationId: string, request: () => Promise<T>) => {
    const handle = owner.begin(operationId, "L1", () => reconcile(operationId));
    try {
      const result = await request();
      if (await handle.settle("succeeded") !== "accepted") throw new TransitionOwnerObsoleteError();
      return result;
    } catch (error) {
      if (error instanceof TransitionOwnerObsoleteError) throw error;
      const observation = await handle.reconcile();
      if (observation.outcome === "still-unknown" || observation.outcome === "authority-lost") {
        throw new TransitionOwnerObsoleteError();
      }
      if (await handle.settle("failed") !== "accepted") throw new TransitionOwnerObsoleteError();
      throw error;
    }
  };
  return {
    ...actions,
    createInvitation: (request) => execute(`host-invitation:create:${request.email}`, () => actions.createInvitation(request)),
    revokeInvitation: (invitationId) => execute(`host-invitation:revoke:${invitationId}`, () => actions.revokeInvitation(invitationId)),
  };
}

export function HostInvitationsRoute() {
  const invitations = useLoaderData() as HostInvitationListPage;
  const { clubSlug = "" } = useParams<{ clubSlug: string }>();
  const queryClient = useQueryClient();
  const context = requireHostClubContext(clubSlug);
  const actions = useMemo(
    () => createHostInvitationsActions(queryClient, context),
    [context, queryClient],
  );
  const transitionOwner = useTransitionSafetyOwner("host-invitations");
  const registeredActions = useMemo(
    () => registerHostInvitationActions(actions, transitionOwner),
    [actions, transitionOwner],
  );

  return <HostInvitations initialInvitations={invitations} actions={registeredActions} />;
}
