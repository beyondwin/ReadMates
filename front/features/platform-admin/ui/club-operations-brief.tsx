import type {
  PlatformAdminPermissionView,
  PlatformAdminSelectedClubBrief,
} from "@/features/platform-admin/model/platform-admin-workbench-model";
import type { PlatformAdminClubRegistryItem } from "@/features/platform-admin/ui/platform-admin-club-registry";
import { ClubPublishChecklist } from "@/features/platform-admin/ui/club-publish-checklist";
import { DomainProvisioningPanel } from "@/features/platform-admin/ui/domain-provisioning-panel";
import { PlatformAdminClubDetail } from "@/features/platform-admin/ui/platform-admin-club-detail";
import {
  SupportAccessGrantsPanel,
  type CreateSupportAccessGrantFields,
  type SupportAccessGrantView,
} from "@/features/platform-admin/ui/support-access-grants-panel";

type Props = {
  club: PlatformAdminSelectedClubBrief | null;
  permissions: PlatformAdminPermissionView;
  savingClub?: boolean;
  checkingDomainIds?: ReadonlySet<string>;
  domainCheckErrors?: Record<string, string>;
  activeGrants?: SupportAccessGrantView[];
  loadingSupportGrants?: boolean;
  supportGrantLoadError?: string | null;
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
  onCheckDomain?: (domainId: string) => void;
  onCreateGrant?: (fields: CreateSupportAccessGrantFields) => Promise<void>;
  onRevokeGrant?: (grantId: string) => Promise<void>;
};

export function ClubOperationsBrief({
  club,
  permissions,
  savingClub = false,
  checkingDomainIds,
  domainCheckErrors,
  activeGrants = [],
  loadingSupportGrants = false,
  supportGrantLoadError = null,
  onUpdateClub,
  onSetVisibility,
  onCheckDomain,
  onCreateGrant,
  onRevokeGrant,
}: Props) {
  if (!club) {
    return (
      <section className="platform-admin-detail" aria-label="선택 클럽 상세">
        <p className="muted platform-admin-domain-empty">선택할 클럽이 없습니다.</p>
      </section>
    );
  }

  return (
    <section
      className="platform-admin-detail platform-admin-brief"
      aria-labelledby="platform-admin-detail-title"
    >
      <div>
        <p className="eyebrow">Club operations brief</p>
        <h2 id="platform-admin-detail-title" className="h3 editorial">
          {club.name}
        </h2>
        <p className="tiny muted">
          {club.slug} · {club.status} · {club.publicVisibility}
        </p>
      </div>
      <ClubPublishChecklist
        club={club}
        permissions={permissions}
        saving={savingClub}
        onSetVisibility={onSetVisibility}
      />
      <PlatformAdminClubDetail club={club} onUpdateClub={onUpdateClub} />
      <DomainProvisioningPanel
        domains={club.domains}
        checkingDomainIds={checkingDomainIds}
        domainCheckErrors={domainCheckErrors}
        canManageDomains={permissions.canManageDomains}
        onCheckDomain={onCheckDomain}
      />
      <SupportAccessGrantsPanel
        selectedClub={club}
        grants={activeGrants}
        loading={loadingSupportGrants}
        loadError={supportGrantLoadError}
        canCreateGrant={permissions.canCreateSupportGrant}
        canRevokeGrant={permissions.canRevokeSupportGrant}
        onCreateGrant={onCreateGrant}
        onRevokeGrant={onRevokeGrant}
      />
    </section>
  );
}
