/* eslint-disable react-refresh/only-export-components -- route module exports its owner adapter for exact transition tests */
import { useMemo } from "react";
import { useLoaderData, useParams } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import type { HostInvitationListPage } from "@/features/host/api/host-contracts";
import { requireHostClubContext } from "@/features/host/model/host-authority-loss";
import HostInvitations from "@/features/host/ui/host-invitations";
import { createHostInvitationsActions } from "./host-invitations-data";
import type {
  HostInvitationsActions,
  OwnerFencedInvitationError,
  RegisteredHostInvitationsActions,
} from "@/features/host/model/host-invitation-actions";
import {
  publishTransitionAction,
  TransitionOwnerObsoleteError,
  useTransitionSafetyOwner,
} from "@/shared/ui/use-transition-safety-owner";

export function registerHostInvitationActions(
  actions: HostInvitationsActions,
  owner: ReturnType<typeof useTransitionSafetyOwner>,
): RegisteredHostInvitationsActions {
  const reconcile = async (operationId: string) => {
    try {
      await actions.listInvitations({ limit: 50 });
    } catch {
      // Detached observation remains conservative when the list is unavailable.
    }
    return { operationId, outcome: "still-unknown" as const };
  };
  const execute = async <T, U>(
    operationId: string,
    request: () => Promise<T>,
    publishCache: (result: T) => Promise<U>,
  ) => {
    const handle = owner.begin(operationId, "L1", () => reconcile(operationId));
    try {
      const result = await request();
      if (await handle.settle("succeeded") !== "accepted") throw new TransitionOwnerObsoleteError();
      const publication = await publishTransitionAction(handle, "cache", () => publishCache(result));
      return {
        ...publication,
        publishUi(publish: (value: U) => void) {
          return handle.publishAccepted({
            surface: "ui",
            publish: () => publish(publication),
          });
        },
      };
    } catch (error) {
      if (error instanceof TransitionOwnerObsoleteError) throw error;
      if (typeof (error as { status?: unknown } | null)?.status === "number") {
        if (await handle.settle("failed") !== "accepted") throw new TransitionOwnerObsoleteError();
        const failure = error as OwnerFencedInvitationError;
        failure.publishUi = (publish) => handle.publishAccepted({
          surface: "errorCopy",
          publish: () => publish(failure),
        });
        throw failure;
      }
      const observation = await handle.reconcile();
      if (observation.outcome === "still-unknown" || observation.outcome === "authority-lost") {
        throw new TransitionOwnerObsoleteError();
      }
      if (await handle.settle("failed") !== "accepted") throw new TransitionOwnerObsoleteError();
      throw error;
    }
  };
  return {
    listInvitations: actions.listInvitations,
    parseInvitationList: actions.parseInvitationList,
    createInvitation: (request) => execute(
      `host-invitation:create:${request.email}`,
      async () => {
        const response = await actions.createInvitation(request);
        if (!response.ok) {
          const error = new Error("create-failed") as Error & { status?: number };
          error.status = response.status;
          throw error;
        }
        return actions.parseInvitation(response);
      },
      async (created) => ({ created, refreshed: await actions.refreshInvitations({ limit: 50 }) }),
    ),
    revokeInvitation: (invitationId) => execute(
      `host-invitation:revoke:${invitationId}`,
      async () => {
        const response = await actions.revokeInvitation(invitationId);
        if (!response.ok) {
          const error = new Error("revoke-failed") as Error & { status?: number };
          error.status = response.status;
          throw error;
        }
        return actions.parseInvitation(response);
      },
      async (revoked) => ({ revoked, refreshed: await actions.refreshInvitations({ limit: 50 }) }),
    ),
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
