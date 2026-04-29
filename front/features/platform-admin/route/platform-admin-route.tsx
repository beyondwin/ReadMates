import { useState } from "react";
import { useLoaderData } from "react-router-dom";
import type { PlatformAdminRouteData } from "@/features/platform-admin/route/platform-admin-data";
import { PlatformAdminDashboard } from "@/features/platform-admin/ui/platform-admin-dashboard";
import { checkPlatformAdminDomainProvisioning } from "@/features/platform-admin/api/platform-admin-api";
import type {
  PlatformAdminDomainResponse,
  PlatformAdminSummaryResponse,
} from "@/features/platform-admin/api/platform-admin-contracts";

export function PlatformAdminRoute() {
  const data = useLoaderData() as PlatformAdminRouteData;
  const [summary, setSummary] = useState(data.summary);
  const [checkingDomainIds, setCheckingDomainIds] = useState<ReadonlySet<string>>(new Set());
  const [checkErrorByDomainId, setCheckErrorByDomainId] = useState<Record<string, string>>({});

  return (
    <PlatformAdminDashboard
      summary={summary}
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
    />
  );
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
