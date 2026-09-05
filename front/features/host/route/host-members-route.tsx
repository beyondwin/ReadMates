/* eslint-disable react-refresh/only-export-components -- route module exports its owner adapter for exact transition tests */
import { useMemo } from "react";
import { useLoaderData, useParams } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import { requireHostClubContext } from "@/features/host/model/host-authority-loss";
import HostMembers, { type HostMembersLinkComponent } from "@/features/host/ui/host-members";
import { createHostMembersActions, type HostMembersRouteData } from "./host-members-data";
import type { HostMembersActions } from "@/features/host/model/host-member-actions";
import { scopedAppPath } from "@/shared/auth/member-app-loader";
import { HOST_ROUTE_HREFS } from "@/shared/routing/host-route-destinations";
import { TransitionOwnerObsoleteError, useTransitionSafetyOwner } from "@/shared/ui/use-transition-safety-owner";

export function registerHostMemberActions(
  actions: HostMembersActions,
  owner: ReturnType<typeof useTransitionSafetyOwner>,
): HostMembersActions {
  const execute = async <T,>(operationId: string, request: () => Promise<T>) => {
    const handle = owner.begin(operationId, "L2", async () => ({ operationId, outcome: "still-unknown" }));
    try {
      const result = await request();
      if (await handle.settle("succeeded") !== "accepted") throw new TransitionOwnerObsoleteError();
      return result;
    } catch (error) {
      if (error instanceof TransitionOwnerObsoleteError) throw error;
      if (await handle.settle("failed") !== "accepted") throw new TransitionOwnerObsoleteError();
      throw error;
    }
  };
  return {
    ...actions,
    submitLifecycle: (membershipId, path, body) => execute(
      `host-member:lifecycle:${membershipId}:${path}`,
      () => actions.submitLifecycle(membershipId, path, body),
    ),
    submitProfile: (membershipId, displayName) => execute(
      `host-member:profile:${membershipId}`,
      () => actions.submitProfile(membershipId, displayName),
    ),
    submitViewerAction: (membershipId, action) => execute(
      `host-member:viewer:${membershipId}:${action}`,
      () => actions.submitViewerAction(membershipId, action),
    ),
  };
}

export function HostMembersRoute({ LinkComponent }: { LinkComponent?: HostMembersLinkComponent }) {
  const { members } = useLoaderData() as HostMembersRouteData;
  const { clubSlug = "" } = useParams<{ clubSlug: string }>();
  const queryClient = useQueryClient();
  const context = requireHostClubContext(clubSlug);
  const actions = useMemo(
    () => createHostMembersActions(queryClient, context),
    [context, queryClient],
  );
  const memberOwner = useTransitionSafetyOwner("host-members");
  const registeredActions = useMemo(
    () => registerHostMemberActions(actions, memberOwner),
    [actions, memberOwner],
  );

  return (
    <HostMembers
      initialMembers={members}
      actions={registeredActions}
      settingsHref={`${scopedAppPath(clubSlug)}${HOST_ROUTE_HREFS.settings.replace(/^\/app/, "")}`}
      LinkComponent={LinkComponent}
    />
  );
}
