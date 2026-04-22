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
    <ReadmatesPageState state={state} loadingLabel="초대 목록을 불러오는 중">
      {(invitations) => <HostInvitations initialInvitations={invitations} />}
    </ReadmatesPageState>
  );
}
