import { Link } from "react-router-dom";
import type { ReactNode } from "react";
import {
  aiFailureDelta,
  blockerNextAction,
  notificationFailureDelta,
  type AdminClubOperationsSnapshot,
} from "@/features/platform-admin/model/platform-admin-club-operations-model";

type AdminClubOperationsPageProps = {
  snapshot: AdminClubOperationsSnapshot;
  supportGrantCount: number;
};

export function AdminClubOperationsPage({ snapshot, supportGrantCount }: AdminClubOperationsPageProps) {
  const notifDelta = notificationFailureDelta(snapshot);
  const aiDelta = aiFailureDelta(snapshot);

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
        <Metric label="알림 실패 (7일)" value={snapshot.notificationHealth.recentFailed7d} delta={notifDelta} />
      </div>

      <section className="admin-club-operations__group" aria-label="플랫폼 운영">
        <h3 className="h4 editorial">플랫폼 운영</h3>
        {snapshot.readiness.blockingReasons.length > 0 ? (
          <ul className="admin-club-operations__blockers">
            {snapshot.readiness.blockingReasons.map((reason) => {
              const action = blockerNextAction(reason, snapshot.club.slug);
              return (
                <li key={reason}>
                  <span>{reason}</span>
                  {action ? (
                    <Link className="btn btn-ghost btn-sm" to={action.href}>
                      {action.label}
                    </Link>
                  ) : null}
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="muted">차단 신호 없음</p>
        )}

        <div className="admin-club-operations__grid">
          <Panel title="Notification health">
            <Stat label="최근 7일 실패" value={snapshot.notificationHealth.recentFailed7d} />
            <Stat label="지난 7일 대비" value={formatDelta(notifDelta)} />
            <Stat label="Pending" value={snapshot.notificationHealth.pending} />
            <Stat label="Failed (전체)" value={snapshot.notificationHealth.failed} />
            <Stat label="Dead (전체)" value={snapshot.notificationHealth.dead} />
            <Link className="btn btn-ghost btn-sm" to={`/admin/notifications?clubId=${snapshot.club.clubId}`}>
              알림 ledger
            </Link>
          </Panel>

          <Panel title="AI usage">
            <Stat label="Active jobs" value={snapshot.aiUsage.activeJobs} />
            <Stat label="최근 7일 실패" value={snapshot.aiUsage.failedRecentJobs} />
            <Stat label="지난 7일 대비" value={formatDelta(aiDelta)} />
            <Stat label="Cost" value={`$${snapshot.aiUsage.costEstimateUsd}`} />
            <Link className="btn btn-ghost btn-sm" to={`/admin/ai-ops?clubId=${snapshot.club.clubId}`}>
              AI Ops
            </Link>
          </Panel>
        </div>
      </section>

      <section className="admin-club-operations__group" aria-label="호스트 운영">
        <h3 className="h4 editorial">호스트 운영</h3>
        <div className="admin-club-operations__grid">
          <Panel title="Session progress">
            <Stat label="예정" value={snapshot.sessionProgress.upcomingCount} />
            <Stat label="닫힘" value={snapshot.sessionProgress.closedCount} />
            <Stat label="공개 기록" value={snapshot.sessionProgress.publishedRecordCount} />
            <Stat label="미완료 기록" value={snapshot.sessionProgress.incompleteRecordCount} />
          </Panel>
          <Panel title="Member activity">
            <Stat label="활성" value={snapshot.memberActivity.activeCount} />
            <Stat label="휴면" value={snapshot.memberActivity.dormantCount} />
            <Stat label="대기" value={snapshot.memberActivity.pendingViewerCount} />
          </Panel>
        </div>
      </section>

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

function formatDelta(delta: number): string {
  if (delta > 0) return `↑ ${delta} (지난 7일 대비)`;
  if (delta < 0) return `↓ ${Math.abs(delta)} (지난 7일 대비)`;
  return `→ 0 (지난 7일 대비)`;
}

function Metric({ label, value, delta }: { label: string; value: number; delta?: number }) {
  return (
    <article className="surface admin-club-operations__metric">
      <p className="tiny muted">{label}</p>
      <strong className="editorial">{value}</strong>
      {delta !== undefined ? <p className="tiny muted">{formatDelta(delta)}</p> : null}
    </article>
  );
}

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="admin-club-operations__panel" aria-labelledby={`${title.replace(/\s+/g, "-").toLowerCase()}-title`}>
      <h4 id={`${title.replace(/\s+/g, "-").toLowerCase()}-title`} className="h5 editorial">{title}</h4>
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
