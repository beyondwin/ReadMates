import { useState } from "react";
import { useLoaderData } from "react-router-dom";
import type { PlatformAdminRouteData } from "@/features/platform-admin/route/platform-admin-data";
import { PlatformAdminDashboard } from "@/features/platform-admin/ui/platform-admin-dashboard";
import {
  checkPlatformAdminDomainProvisioning,
  commitPlatformAdminOnboarding,
  createSupportAccessGrant,
  previewPlatformAdminOnboarding,
  revokeSupportAccessGrant,
  updatePlatformAdminClub,
} from "@/features/platform-admin/api/platform-admin-api";
import type {
  CreateSupportAccessGrantRequest,
  PlatformAdminClubListResponse,
  PlatformAdminDomainResponse,
  PlatformAdminSummaryResponse,
  SupportAccessGrantResponse,
} from "@/features/platform-admin/api/platform-admin-contracts";
import type { CreateSupportAccessGrantFields } from "@/features/platform-admin/ui/support-access-grants-panel";

export function PlatformAdminRoute() {
  const data = useLoaderData() as PlatformAdminRouteData;
  const [summary, setSummary] = useState(data.summary);
  const [clubs, setClubs] = useState(data.clubs);
  const [checkingDomainIds, setCheckingDomainIds] = useState<ReadonlySet<string>>(new Set());
  const [checkErrorByDomainId, setCheckErrorByDomainId] = useState<Record<string, string>>({});
  const [activeGrants, setActiveGrants] = useState<SupportAccessGrantResponse[]>([]);

  async function handleCreateGrant(fields: CreateSupportAccessGrantFields) {
    const request: CreateSupportAccessGrantRequest = {
      clubId: fields.clubId,
      granteeUserId: fields.granteeUserId,
      scope: fields.scope,
      reason: fields.reason,
      expiresAt: fields.expiresAt,
    };
    const grant = await createSupportAccessGrant(request);
    setActiveGrants((current) => [grant, ...current]);
  }

  async function handleRevokeGrant(grantId: string) {
    await revokeSupportAccessGrant(grantId);
    setActiveGrants((current) => current.filter((g) => g.id !== grantId));
  }

  return (
    <PlatformAdminDashboard
      summary={summary}
      clubs={clubs}
      checkingDomainIds={checkingDomainIds}
      domainCheckErrors={checkErrorByDomainId}
      onCheckDomain={async (domainId) => {
        setCheckingDomainIds((current) => withSetValue(current, domainId));
        setCheckErrorByDomainId((current) => withoutKey(current, domainId));
        try {
          const checkedDomain = await checkPlatformAdminDomainProvisioning(domainId);
          setSummary((current) => summaryWithUpdatedDomain(current, checkedDomain));
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
        const result = await commitPlatformAdminOnboarding(request);
        setClubs((current) => prependOrReplaceClub(current, result.club));
        return result;
      }}
      onUpdateClub={async (clubId, request) => {
        const updated = await updatePlatformAdminClub(clubId, request);
        setClubs((current) => replaceClub(current, updated));
        return updated;
      }}
      activeGrants={activeGrants}
      onCreateGrant={handleCreateGrant}
      onRevokeGrant={handleRevokeGrant}
    />
  );
}

function prependOrReplaceClub(
  clubs: PlatformAdminClubListResponse,
  club: PlatformAdminClubListResponse["items"][number],
): PlatformAdminClubListResponse {
  if (clubs.items.some((candidate) => candidate.clubId === club.clubId)) {
    return replaceClub(clubs, club);
  }
  return { items: [club, ...clubs.items] };
}

function replaceClub(
  clubs: PlatformAdminClubListResponse,
  club: PlatformAdminClubListResponse["items"][number],
): PlatformAdminClubListResponse {
  return {
    items: clubs.items.map((candidate) => (candidate.clubId === club.clubId ? club : candidate)),
  };
}

function summaryWithUpdatedDomain(
  summary: PlatformAdminSummaryResponse,
  domain: PlatformAdminDomainResponse,
): PlatformAdminSummaryResponse {
  return {
    ...summary,
    domainActionRequiredCount: recomputeActionRequiredCount(summary, domain),
    domains: replaceDomain(summary.domains ?? summary.domainsRequiringAction ?? [], domain),
    domainsRequiringAction: replaceDomain(summary.domainsRequiringAction ?? [], domain)
      .filter((candidate) => candidate.status === "ACTION_REQUIRED"),
  };
}

function replaceDomain(domains: PlatformAdminDomainResponse[], domain: PlatformAdminDomainResponse) {
  if (!domains.some((candidate) => candidate.id === domain.id)) {
    return [domain, ...domains];
  }

  return domains.map((candidate) => (candidate.id === domain.id ? domain : candidate));
}

function recomputeActionRequiredCount(
  summary: PlatformAdminSummaryResponse,
  domain: PlatformAdminDomainResponse,
) {
  const currentDomain = (summary.domains ?? summary.domainsRequiringAction ?? [])
    .find((candidate) => candidate.id === domain.id);
  if (!currentDomain) {
    return summary.domainActionRequiredCount;
  }

  if (currentDomain.status === "ACTION_REQUIRED" && domain.status !== "ACTION_REQUIRED") {
    return Math.max(0, summary.domainActionRequiredCount - 1);
  }
  if (currentDomain.status !== "ACTION_REQUIRED" && domain.status === "ACTION_REQUIRED") {
    return summary.domainActionRequiredCount + 1;
  }
  return summary.domainActionRequiredCount;
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
