import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLoaderData, useParams } from "react-router";
import type { AuthMeResponse } from "@/shared/auth/auth-contracts";
import type { ReadmatesReturnState, ReadmatesReturnTarget } from "@/shared/routing/readmates-route-state";
import { hostSessionRecordLedgerQuery } from "@/features/host/queries/host-session-record-queries";
import type { HostLinkComponent } from "@/features/host/ui/host-link-types";
import {
  HostMeetingLedger,
  type HostMeetingLedgerLinkComponent,
} from "@/features/host/ui/meeting-ledger/host-meeting-ledger";
import { HOST_HOME_ATTENTION_LIMIT, type HostDashboardRouteData } from "./host-dashboard-data";

export function HostDashboardRoute({
  LinkComponent,
}: {
  auth?: AuthMeResponse;
  LinkComponent?: HostLinkComponent;
  hostDashboardReturnTarget?: ReadmatesReturnTarget;
  readmatesReturnState?: (target: ReadmatesReturnTarget) => ReadmatesReturnState;
}) {
  const loaderData = useLoaderData() as HostDashboardRouteData;
  const { clubSlug } = useParams<{ clubSlug: string }>();
  const context = useMemo(() => ({ clubSlug }), [clubSlug]);
  const attentionQuery = useQuery({
    ...hostSessionRecordLedgerQuery({
      needsAttention: true,
      page: { limit: HOST_HOME_ATTENTION_LIMIT },
    }, context),
    retry: false,
  });
  const attentionPage = attentionQuery.data
    ?? (attentionQuery.isError ? null : loaderData.recordAttention);
  const attentionError = Boolean(
    (attentionQuery.isError && !attentionQuery.data)
    || (loaderData.attentionError && !attentionQuery.data),
  );
  const ledgerLink = useMemo<HostMeetingLedgerLinkComponent | undefined>(() => {
    if (!LinkComponent) {
      return undefined;
    }
    return function HostHomeLedgerLink({ to, className, children, ...props }) {
      return (
        <LinkComponent to={to} className={className} {...props}>
          {children}
        </LinkComponent>
      );
    };
  }, [LinkComponent]);

  return (
    <HostMeetingLedger
      items={[]}
      attentionPage={attentionPage}
      attentionError={attentionError}
      onRetryAttention={() => {
        void attentionQuery.refetch();
      }}
      LinkComponent={ledgerLink}
    />
  );
}
