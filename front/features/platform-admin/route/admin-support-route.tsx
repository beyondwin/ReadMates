import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { platformAdminClubsQuery, platformAdminSummaryQuery } from "@/features/platform-admin/queries/platform-admin-queries";
import {
  platformAdminSupportLedgerQuery,
  platformAdminSupportSearchQuery,
  useCreateAdminSupportGrantMutation,
  useRevokeAdminSupportGrantMutation,
} from "@/features/platform-admin/queries/platform-admin-support-queries";
import type { AdminSupportSearchResult } from "@/features/platform-admin/model/platform-admin-support-model";
import { AdminSupportWorkbench } from "@/features/platform-admin/ui/admin-support-workbench";

function defaultExpiresAt(): string {
  const d = new Date(Date.now() + 60 * 60 * 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function AdminSupportRoute() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [query, setQuery] = useState("");
  const [submittedQuery, setSubmittedQuery] = useState("");
  const [selectedResult, setSelectedResult] = useState<AdminSupportSearchResult | null>(null);
  const [reason, setReason] = useState("");
  const [expiresAt, setExpiresAt] = useState(defaultExpiresAt);
  const [error, setError] = useState<string | null>(null);
  const selectedClubId = searchParams.get("clubId");
  const role = useQuery(platformAdminSummaryQuery()).data?.platformRole ?? "SUPPORT";
  const clubsQuery = useQuery(platformAdminClubsQuery());
  const searchQuery = useQuery(platformAdminSupportSearchQuery(submittedQuery, selectedClubId ?? undefined));
  const ledgerQuery = useQuery(platformAdminSupportLedgerQuery(selectedClubId ? { clubId: selectedClubId } : {}));
  const createGrant = useCreateAdminSupportGrantMutation();
  const revokeGrant = useRevokeAdminSupportGrantMutation();
  const canCreateGrant = role === "OWNER";

  async function search() {
    setError(null);
    setSelectedResult(null);
    setSubmittedQuery(query.trim());
  }

  async function create() {
    if (!selectedResult || !selectedClubId) return;
    setError(null);
    try {
      await createGrant.mutateAsync({
        clubId: selectedClubId,
        granteeSubjectId: selectedResult.subjectId,
        scope: "HOST_SUPPORT_READ",
        reason,
        expiresAt: new Date(expiresAt).toISOString(),
      });
      setReason("");
      setSelectedResult(null);
    } catch {
      setError("지원 접근 권한을 발급하지 못했습니다.");
    }
  }

  async function revoke(grantId: string) {
    setError(null);
    try {
      await revokeGrant.mutateAsync(grantId);
    } catch {
      setError("지원 접근 권한을 취소하지 못했습니다.");
    }
  }

  return (
    <AdminSupportWorkbench
      clubs={clubsQuery.data?.items ?? []}
      selectedClubId={selectedClubId}
      query={query}
      results={searchQuery.data ?? []}
      selectedResult={selectedResult}
      ledger={ledgerQuery.data ?? []}
      reason={reason}
      expiresAt={expiresAt}
      busy={searchQuery.isFetching || createGrant.isPending || revokeGrant.isPending}
      error={error}
      canCreateGrant={canCreateGrant}
      onQueryChange={setQuery}
      onSearch={search}
      onSelectResult={setSelectedResult}
      onClubChange={(clubId) => setSearchParams(clubId ? { clubId } : {})}
      onReasonChange={setReason}
      onExpiresAtChange={setExpiresAt}
      onCreateGrant={create}
      onRevokeGrant={revoke}
    />
  );
}
