import { Link } from "react-router";
import type { PlatformAdminSelectedClubBrief } from "@/features/platform-admin/model/platform-admin-workbench-model";

type SupportAccessGrantsPanelProps = {
  selectedClub: PlatformAdminSelectedClubBrief;
  canManageGrant?: boolean;
};

export function SupportAccessGrantsPanel({
  selectedClub,
  canManageGrant = false,
}: SupportAccessGrantsPanelProps) {
  return (
    <section className="platform-admin-support-grants" aria-labelledby="support-grants-title">
      <div className="platform-admin-domains__header">
        <div>
          <p className="eyebrow">Support access</p>
          <h3 id="support-grants-title" className="h4 editorial">지원 접근 권한</h3>
          <p className="tiny muted">대상 클럽: {selectedClub.name} ({selectedClub.slug})</p>
        </div>
        <Link className="btn btn-ghost btn-sm" to={`/admin/support?clubId=${encodeURIComponent(selectedClub.clubId)}`}>
          {canManageGrant ? "지원 권한 검토" : "지원 이력 보기"}
        </Link>
      </div>
    </section>
  );
}
