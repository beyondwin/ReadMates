import { useCallback } from "react";
import HostInvitations from "@/features/host/components/host-invitations";
import type { HostInvitationListItem } from "@/shared/api/readmates";
import { readmatesFetch } from "@/shared/api/readmates";
import { useReadmatesData } from "./readmates-page-data";
import { ReadmatesPageState } from "./readmates-page";

export default function HostInvitationsPage() {
  const state = useReadmatesData(
    useCallback(() => readmatesFetch<HostInvitationListItem[]>("/api/host/invitations"), []),
  );

  return (
    <ReadmatesPageState state={state}>
      {(invitations) => <HostInvitations initialInvitations={invitations} />}
    </ReadmatesPageState>
  );
}
