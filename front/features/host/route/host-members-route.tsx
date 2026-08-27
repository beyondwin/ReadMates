import { useMemo } from "react";
import { useLoaderData, useParams } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import { requireHostClubContext } from "@/features/host/model/host-authority-loss";
import HostMembers, { type HostMembersLinkComponent } from "@/features/host/ui/host-members";
import { createHostInvitationsActions } from "./host-invitations-data";
import { createHostMembersActions, type HostMembersRouteData } from "./host-members-data";
import "@/features/host/ui/host-editorial-ledger.css";

export function HostMembersRoute({ LinkComponent }: { LinkComponent?: HostMembersLinkComponent }) {
  const { members, invitations } = useLoaderData() as HostMembersRouteData;
  const { clubSlug = "" } = useParams<{ clubSlug: string }>();
  const queryClient = useQueryClient();
  const context = requireHostClubContext(clubSlug);
  const actions = useMemo(
    () => createHostMembersActions(queryClient, context),
    [context, queryClient],
  );
  const invitationActions = useMemo(
    () => createHostInvitationsActions(queryClient, context),
    [context, queryClient],
  );

  return (
    <main className="rm-host-members-page rm-host-editorial-ledger rm-host-editorial-ledger--context">
      <section className="page-header-compact">
        <div className="container rm-host-editorial-ledger__context">
          <div className="eyebrow rm-host-editorial-ledger__eyebrow">운영 · 멤버 관리</div>
          <h1 className="h1 editorial rm-host-editorial-ledger__heading">
            멤버 관리
          </h1>
          <p className="small rm-host-editorial-ledger__lede">
            멤버 상태와 이번 모임 참여 여부를 함께 확인합니다.
          </p>
        </div>
      </section>
      <section className="container rm-host-members-page__body">
        <HostMembers
          initialMembers={members}
          actions={actions}
          initialInvitations={invitations}
          invitationActions={invitationActions}
          LinkComponent={LinkComponent}
        />
      </section>
    </main>
  );
}
