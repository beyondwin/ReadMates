import { Link } from "react-router-dom";
import type { ReactNode } from "react";
import type { AdminClubOperationsSnapshot } from "@/features/platform-admin/model/platform-admin-club-operations-model";

type AdminClubOperationsPageProps = {
  snapshot: AdminClubOperationsSnapshot;
  supportGrantCount: number;
};

export function AdminClubOperationsPage({ snapshot, supportGrantCount }: AdminClubOperationsPageProps) {
  return (
    <section className="admin-club-operations" aria-labelledby="admin-club-operations-title">
      <header className="admin-club-operations__header">
        <div>
          <p className="eyebrow">Operations snapshot</p>
          <h2 id="admin-club-operations-title" className="h3 editorial">
            {snapshot.club.name} 운영 스냅샷
          </h2>
        </div>
        <span className="platform-admin-domain-status">{snapshot.readiness.state}</span>
      </header>

      <div className="admin-club-operations__summary">
        <Metric label="활성 멤버" value={snapshot.memberActivity.activeCount} />
        <Metric label="호스트" value={snapshot.memberActivity.hostCount} />
        <Metric label="지원 grant" value={supportGrantCount} />
        <Metric label="열린 세션" value={snapshot.sessionProgress.currentOpenCount} />
        <Metric label="알림 실패" value={snapshot.notificationHealth.failed + snapshot.notificationHealth.dead} />
      </div>

      {snapshot.readiness.blockingReasons.length > 0 ? (
        <div className="admin-club-operations__blockers">
          {snapshot.readiness.blockingReasons.map((reason) => (
            <span key={reason}>{reason}</span>
          ))}
        </div>
      ) : null}

      <div className="admin-club-operations__grid">
        <Panel title="Session progress">
          <Stat label="예정" value={snapshot.sessionProgress.upcomingCount} />
          <Stat label="닫힘" value={snapshot.sessionProgress.closedCount} />
          <Stat label="공개 기록" value={snapshot.sessionProgress.publishedRecordCount} />
          <Stat label="미완료 기록" value={snapshot.sessionProgress.incompleteRecordCount} />
        </Panel>

        <Panel title="Notification health">
          <Stat label="Pending" value={snapshot.notificationHealth.pending} />
          <Stat label="Failed" value={snapshot.notificationHealth.failed} />
          <Stat label="Dead" value={snapshot.notificationHealth.dead} />
          <Link className="btn btn-ghost btn-sm" to={`/admin/notifications?clubId=${snapshot.club.clubId}`}>
            알림 ledger
          </Link>
        </Panel>

        <Panel title="AI usage">
          <Stat label="Active jobs" value={snapshot.aiUsage.activeJobs} />
          <Stat label="Failed recent" value={snapshot.aiUsage.failedRecentJobs} />
          <Stat label="Cost" value={`$${snapshot.aiUsage.costEstimateUsd}`} />
          <Link className="btn btn-ghost btn-sm" to={`/admin/ai-ops?clubId=${snapshot.club.clubId}`}>
            AI Ops
          </Link>
        </Panel>
      </div>

      <div className="admin-club-operations__links">
        {snapshot.safeLinks.map((link) => (
          <Link key={`${link.kind}-${link.href}`} to={link.href} className="admin-club-operations__link">
            {link.label}
          </Link>
        ))}
      </div>
    </section>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <article className="surface admin-club-operations__metric">
      <p className="tiny muted">{label}</p>
      <strong className="editorial">{value}</strong>
    </article>
  );
}

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="admin-club-operations__panel" aria-labelledby={`${title.replace(/\s+/g, "-").toLowerCase()}-title`}>
      <h3 id={`${title.replace(/\s+/g, "-").toLowerCase()}-title`} className="h4 editorial">{title}</h3>
      <div className="admin-club-operations__stats">{children}</div>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="admin-club-operations__stat">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
