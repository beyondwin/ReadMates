import { useState } from "react";
import type { PlatformAdminWorkbenchView } from "@/features/platform-admin/model/platform-admin-workbench-model";
import {
  PlatformAdminAiOps,
  type PlatformAdminAiOpsJobView,
  type PlatformAdminAiOpsSummaryView,
} from "@/features/platform-admin/ui/platform-admin-ai-ops";
import type { PlatformAdminClubRegistryItem } from "@/features/platform-admin/ui/platform-admin-club-registry";
import {
  PlatformAdminOnboardingWizard,
  type PlatformAdminOnboardingPreviewResponse,
  type PlatformAdminOnboardingRequest,
  type PlatformAdminOnboardingResultResponse,
} from "@/features/platform-admin/ui/platform-admin-onboarding-wizard";
import { PlatformAdminOverviewMetrics } from "@/features/platform-admin/ui/platform-admin-overview-metrics";
import { PlatformAdminWorkQueue } from "@/features/platform-admin/ui/platform-admin-work-queue";
import { ClubOperationsBrief } from "@/features/platform-admin/ui/club-operations-brief";
import type {
  CreateSupportAccessGrantFields,
  SupportAccessGrantView,
} from "@/features/platform-admin/ui/support-access-grants-panel";

type PlatformAdminDashboardProps = {
  workbench: PlatformAdminWorkbenchView;
  selectedClubId: string | null;
  onSelectClub?: (clubId: string) => void;
  checkingDomainIds?: ReadonlySet<string>;
  domainCheckErrors?: Record<string, string>;
  onCheckDomain?: (domainId: string) => void;
  onPreviewOnboarding?: (request: PlatformAdminOnboardingRequest) => Promise<PlatformAdminOnboardingPreviewResponse>;
  onCommitOnboarding?: (request: PlatformAdminOnboardingRequest) => Promise<PlatformAdminOnboardingResultResponse>;
  onUpdateClub?: (
    clubId: string,
    request: {
      name?: string;
      tagline?: string;
      about?: string;
      publicVisibility?: "PRIVATE" | "PUBLIC";
    },
  ) => Promise<PlatformAdminClubRegistryItem>;
  onSetVisibility?: (publicVisibility: "PRIVATE" | "PUBLIC") => void;
  activeGrants?: SupportAccessGrantView[];
  loadingSupportGrants?: boolean;
  supportGrantLoadError?: string | null;
  onCreateGrant?: (fields: CreateSupportAccessGrantFields) => Promise<void>;
  onRevokeGrant?: (grantId: string) => Promise<void>;
  aiOpsSummary?: PlatformAdminAiOpsSummaryView | null;
  aiOpsJobs?: PlatformAdminAiOpsJobView[];
  aiOpsLoading?: boolean;
  aiOpsError?: string | null;
  onForceCancelAiJob?: (jobId: string) => void;
};

export function PlatformAdminDashboard({
  workbench,
  selectedClubId,
  onSelectClub,
  checkingDomainIds = new Set<string>(),
  domainCheckErrors = {},
  onCheckDomain,
  onPreviewOnboarding,
  onCommitOnboarding,
  onUpdateClub,
  onSetVisibility,
  activeGrants = [],
  loadingSupportGrants = false,
  supportGrantLoadError = null,
  onCreateGrant,
  onRevokeGrant,
  aiOpsSummary = null,
  aiOpsJobs = [],
  aiOpsLoading = false,
  aiOpsError = null,
  onForceCancelAiJob,
}: PlatformAdminDashboardProps) {
  const [showOnboarding, setShowOnboarding] = useState(false);

  return (
    <main className="platform-admin-page">
      <section className="container platform-admin-page__inner" aria-labelledby="platform-admin-title">
        <div className="platform-admin-page__header">
          <p className="eyebrow">ReadMates Admin</p>
          <h1 id="platform-admin-title" className="h1 editorial">
            플랫폼 관리
          </h1>
          {workbench.permissions.canCreateClub ? (
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={() => setShowOnboarding((current) => !current)}
            >
              새 클럽
            </button>
          ) : null}
        </div>

        <PlatformAdminOverviewMetrics metrics={workbench.metrics} />

        <div className="platform-admin-console">
          <PlatformAdminWorkQueue
            items={workbench.queueItems}
            selectedClubId={selectedClubId}
            onSelectClub={onSelectClub}
          />
          <ClubOperationsBrief
            club={workbench.selectedClub}
            permissions={workbench.permissions}
            checkingDomainIds={checkingDomainIds}
            domainCheckErrors={domainCheckErrors}
            activeGrants={activeGrants}
            loadingSupportGrants={loadingSupportGrants}
            supportGrantLoadError={supportGrantLoadError}
            onUpdateClub={onUpdateClub}
            onSetVisibility={onSetVisibility}
            onCheckDomain={onCheckDomain}
            onCreateGrant={onCreateGrant}
            onRevokeGrant={onRevokeGrant}
          />
        </div>

        <PlatformAdminAiOps
          role={workbench.metrics.platformRole}
          summary={aiOpsSummary}
          jobs={aiOpsJobs}
          loading={aiOpsLoading}
          error={aiOpsError}
          onForceCancel={onForceCancelAiJob}
        />

        {showOnboarding && onPreviewOnboarding != null && onCommitOnboarding != null ? (
          <PlatformAdminOnboardingWizard
            onPreview={onPreviewOnboarding}
            onCommit={onCommitOnboarding}
            onCreated={(result) => {
              onSelectClub?.(result.club.clubId);
              setShowOnboarding(false);
            }}
          />
        ) : null}
      </section>
    </main>
  );
}
