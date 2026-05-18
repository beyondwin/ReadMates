import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLoaderData } from "react-router-dom";
import type { PlatformAdminRouteData } from "@/features/platform-admin/route/platform-admin-data";
import { PlatformAdminDashboard } from "@/features/platform-admin/ui/platform-admin-dashboard";
import { previewPlatformAdminOnboarding } from "@/features/platform-admin/api/platform-admin-api";
import type { CreateSupportAccessGrantRequest } from "@/features/platform-admin/api/platform-admin-contracts";
import {
  buildPlatformAdminWorkbench,
  type PlatformAdminWorkbenchInput,
} from "@/features/platform-admin/model/platform-admin-workbench-model";
import {
  platformAdminClubsQuery,
  platformAdminSummaryQuery,
  platformAdminSupportGrantsQuery,
  useCheckPlatformAdminDomainProvisioningMutation,
  useCommitPlatformAdminOnboardingMutation,
  useCreateSupportAccessGrantMutation,
  useRevokeSupportAccessGrantMutation,
  useUpdatePlatformAdminClubMutation,
} from "@/features/platform-admin/queries/platform-admin-queries";
import type { CreateSupportAccessGrantFields } from "@/features/platform-admin/ui/support-access-grants-panel";

export function PlatformAdminRoute() {
  const data = useLoaderData() as PlatformAdminRouteData;
  const [checkingDomainIds, setCheckingDomainIds] = useState<ReadonlySet<string>>(new Set());
  const [checkErrorByDomainId, setCheckErrorByDomainId] = useState<Record<string, string>>({});
  const [selectedClubId, setSelectedClubId] = useState<string | null>(null);
  const [supportGrantMutationError, setSupportGrantMutationError] = useState<string | null>(null);

  const summaryQuery = useQuery(platformAdminSummaryQuery());
  const clubsQuery = useQuery(platformAdminClubsQuery());
  const summary = summaryQuery.data ?? data.summary;
  const clubs = clubsQuery.data ?? data.clubs;

  const workbench = useMemo(() => {
    const input: PlatformAdminWorkbenchInput = {
      role: summary.platformRole,
      activeClubCount: summary.activeClubCount,
      domainActionRequiredCount: summary.domainActionRequiredCount,
      selectedClubId,
      clubs: clubs.items,
      domains: summary.domains ?? summary.domainsRequiringAction ?? [],
    };
    return buildPlatformAdminWorkbench(input);
  }, [clubs.items, selectedClubId, summary]);

  const effectiveSelectedClubId = workbench.selectedClub?.clubId ?? null;
  const supportGrantsQuery = useQuery(platformAdminSupportGrantsQuery(effectiveSelectedClubId));

  const domainCheckMutation = useCheckPlatformAdminDomainProvisioningMutation();
  const onboardingMutation = useCommitPlatformAdminOnboardingMutation();
  const updateClubMutation = useUpdatePlatformAdminClubMutation();
  const createGrantMutation = useCreateSupportAccessGrantMutation(effectiveSelectedClubId);
  const revokeGrantMutation = useRevokeSupportAccessGrantMutation(effectiveSelectedClubId);

  async function handleCreateGrant(fields: CreateSupportAccessGrantFields) {
    const clubId = workbench.selectedClub?.clubId;
    if (!clubId) {
      throw new Error("No selected club for support access grant");
    }
    const request: CreateSupportAccessGrantRequest = {
      clubId,
      granteeUserId: fields.granteeUserId,
      scope: fields.scope,
      reason: fields.reason,
      expiresAt: fields.expiresAt,
    };
    setSupportGrantMutationError(null);
    try {
      await createGrantMutation.mutateAsync(request);
    } catch (error) {
      setSupportGrantMutationError("지원 접근 권한을 만들지 못했습니다.");
      throw error;
    }
  }

  async function handleRevokeGrant(grantId: string) {
    setSupportGrantMutationError(null);
    try {
      await revokeGrantMutation.mutateAsync(grantId);
    } catch (error) {
      setSupportGrantMutationError("지원 접근 권한을 회수하지 못했습니다.");
      throw error;
    }
  }

  return (
    <PlatformAdminDashboard
      workbench={workbench}
      selectedClubId={effectiveSelectedClubId}
      onSelectClub={(clubId) => {
        setSupportGrantMutationError(null);
        setSelectedClubId(clubId);
      }}
      checkingDomainIds={checkingDomainIds}
      domainCheckErrors={checkErrorByDomainId}
      onCheckDomain={async (domainId) => {
        setCheckingDomainIds((current) => withSetValue(current, domainId));
        setCheckErrorByDomainId((current) => withoutKey(current, domainId));
        try {
          await domainCheckMutation.mutateAsync(domainId);
        } catch {
          setCheckErrorByDomainId((current) => ({
            ...current,
            [domainId]: "상태 확인에 실패했습니다. 잠시 후 다시 실행하세요.",
          }));
        } finally {
          setCheckingDomainIds((current) => withoutSetValue(current, domainId));
        }
      }}
      onPreviewOnboarding={previewPlatformAdminOnboarding}
      onCommitOnboarding={async (request) => {
        const result = await onboardingMutation.mutateAsync(request);
        setSelectedClubId(result.club.clubId);
        return result;
      }}
      onUpdateClub={async (clubId, request) => updateClubMutation.mutateAsync({ clubId, request })}
      onSetVisibility={async (publicVisibility) => {
        const clubId = workbench.selectedClub?.clubId;
        if (!clubId) return;
        await updateClubMutation.mutateAsync({ clubId, request: { publicVisibility } });
      }}
      activeGrants={supportGrantsQuery.data ?? []}
      loadingSupportGrants={supportGrantsQuery.isFetching}
      supportGrantLoadError={
        supportGrantMutationError ??
        (supportGrantsQuery.isError ? "지원 접근 권한을 불러오지 못했습니다." : null)
      }
      onCreateGrant={handleCreateGrant}
      onRevokeGrant={handleRevokeGrant}
    />
  );
}

function withoutKey(record: Record<string, string>, key: string) {
  const next = { ...record };
  delete next[key];
  return next;
}

function withSetValue(values: ReadonlySet<string>, value: string) {
  return new Set(values).add(value);
}

function withoutSetValue(values: ReadonlySet<string>, value: string) {
  const next = new Set(values);
  next.delete(value);
  return next;
}
