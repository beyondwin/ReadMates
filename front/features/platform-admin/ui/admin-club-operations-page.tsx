import type { ReactNode } from "react";
import {
  aiFailureDelta,
  notificationFailureDelta,
  type AdminClubOperationsSnapshot,
} from "@/features/platform-admin/model/platform-admin-club-operations-model";
import { ADMIN_COPY } from "@/features/platform-admin/model/admin-copy";

export type AdminClubOperationsNavigationLink = {
  id: string;
  href: string;
  label: string;
  className: string;
};

export type AdminClubOperationsNavigation = {
  blockers: ReadonlyArray<{
    code: string;
    label: string;
    action: AdminClubOperationsNavigationLink | null;
  }>;
  notifications: AdminClubOperationsNavigationLink;
  aiOps: AdminClubOperationsNavigationLink;
  safeLinks: ReadonlyArray<AdminClubOperationsNavigationLink>;
};

type AdminClubOperationsPageProps = {
  snapshot: AdminClubOperationsSnapshot;
  navigation: AdminClubOperationsNavigation;
  renderLink: (link: AdminClubOperationsNavigationLink) => ReactNode;
  supportGrantCount?: number;
  supportGrantUnavailable?: boolean;
  onRetrySupportGrants?: () => void;
};

export function AdminClubOperationsPage({
  snapshot,
  navigation,
  renderLink,
  supportGrantCount,
  supportGrantUnavailable = false,
  onRetrySupportGrants,
}: AdminClubOperationsPageProps) {
  const notifDelta = notificationFailureDelta(snapshot);
  const aiDelta = aiFailureDelta(snapshot);

  return (
    <section
      className="admin-club-operations"
      aria-labelledby="admin-club-operations-title"
    >
      <header className="admin-club-operations__header">
        <div>
          <p className="eyebrow">{ADMIN_COPY.eyebrow.operationsSnapshot}</p>
          <h3 id="admin-club-operations-title" className="h3 editorial">
            운영 영향 요약
          </h3>
        </div>
        <span className="platform-admin-domain-status">
          {snapshot.readiness.blockingReasons.length > 0 ? "확인 필요" : "준비됨"}
        </span>
      </header>

      <div className="admin-club-operations__summary">
        <Metric label="활성 멤버" value={snapshot.memberActivity.activeCount} inventory />
        <Metric label="호스트" value={snapshot.memberActivity.hostCount} inventory />
        {supportGrantCount !== undefined ? (
          <Metric label={ADMIN_COPY.support.count} value={supportGrantCount} />
        ) : supportGrantUnavailable ? (
          <article className="surface admin-club-operations__metric">
            <p className="tiny muted">{ADMIN_COPY.support.unavailable}</p>
            {onRetrySupportGrants ? (
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={onRetrySupportGrants}
              >
                {ADMIN_COPY.support.retry}
              </button>
            ) : null}
          </article>
        ) : null}
        <Metric
          label="열린 모임"
          value={snapshot.sessionProgress.currentOpenCount}
          inventory
        />
        <Metric
          label="알림 실패 (7일)"
          value={snapshot.notificationHealth.recentFailed7d}
          delta={notifDelta}
        />
      </div>

      <section
        className="admin-club-operations__group"
        aria-label="플랫폼 운영"
      >
        <h4 className="h4 editorial">플랫폼 운영</h4>
        {navigation.blockers.length > 0 ? (
          <ul className="admin-club-operations__blockers">
            {navigation.blockers.map((blocker) => (
              <li key={blocker.code}>
                <span>{blocker.label}</span>
                {blocker.action ? renderLink(blocker.action) : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted">차단 신호 없음</p>
        )}

        <div className="admin-club-operations__grid">
          <Panel title="알림 전달 상태">
            <Stat
              label="최근 7일 실패"
              value={deviantCount(snapshot.notificationHealth.recentFailed7d)}
            />
            <Stat label="지난 7일 대비" value={deviantDelta(notifDelta)} />
            <Stat label="대기" value={deviantCount(snapshot.notificationHealth.pending)} />
            <Stat
              label="실패 (전체)"
              value={deviantCount(snapshot.notificationHealth.failed)}
            />
            <Stat
              label="중단 (전체)"
              value={deviantCount(snapshot.notificationHealth.dead)}
            />
            {renderLink(navigation.notifications)}
          </Panel>

          <Panel title="AI 작업 상태">
            <Stat
              label="최근 7일 실패"
              value={deviantCount(snapshot.aiUsage.failedRecentJobs)}
            />
            <Stat label="지난 7일 대비" value={deviantDelta(aiDelta)} />
            <Stat label="예상 비용" value={deviantCost(snapshot.aiUsage.costEstimateUsd)} />
            {renderLink(navigation.aiOps)}
          </Panel>
        </div>
      </section>

      <section
        className="admin-club-operations__group"
        aria-label="호스트 운영"
      >
        <h4 className="h4 editorial">호스트 운영</h4>
        <div className="admin-club-operations__grid">
          <Panel title="모임 운영 집계">
            <Stat label="예정" value={null} />
            <Stat label="닫힘" value={null} />
            <Stat label="공개 기록" value={null} />
            <Stat
              label="미완료 기록"
              value={deviantCount(snapshot.sessionProgress.incompleteRecordCount)}
            />
          </Panel>
          <Panel title="멤버 운영 집계">
            <Stat label="활성" value={null} />
            <Stat label="휴면" value={deviantCount(snapshot.memberActivity.dormantCount)} />
            <Stat label="가입 대기" value={deviantCount(snapshot.memberActivity.pendingViewerCount)} />
          </Panel>
        </div>
        <ClosingRiskPanel snapshot={snapshot} />
      </section>

      <div className="admin-club-operations__links">
        {navigation.safeLinks.map(renderLink)}
      </div>
    </section>
  );
}

function formatDelta(delta: number): string {
  if (delta > 0) return `↑ ${delta} (지난 7일 대비)`;
  if (delta < 0) return `↓ ${Math.abs(delta)} (지난 7일 대비)`;
  return `→ 0 (지난 7일 대비)`;
}

function deviantCount(value: number): number | null {
  return value > 0 ? value : null;
}

function deviantDelta(delta: number): string | null {
  return delta === 0 ? null : formatDelta(delta);
}

function deviantCost(value: string): string | null {
  const amount = Number(value);
  return Number.isFinite(amount) && amount > 0 ? `$${value}` : null;
}

function closingRiskCountsLabel(
  closingRisks: AdminClubOperationsSnapshot["closingRisks"],
): string | null {
  const incomplete = closingRisks?.incompleteCount ?? 0;
  const blocked = closingRisks?.blockedCount ?? 0;
  const ready = closingRisks?.readyCount ?? 0;
  if (incomplete === 0 && blocked === 0 && ready === 0) return null;
  return `미완료 ${incomplete} · 차단 ${blocked} · 준비 ${ready}`;
}

function Metric({
  label,
  value,
  delta,
  inventory = false,
}: {
  label: string;
  value: number;
  delta?: number;
  inventory?: boolean;
}) {
  const showValue = !inventory && value > 0;
  return (
    <article className="surface admin-club-operations__metric">
      <p className="tiny muted">{label}</p>
      {showValue ? <strong className="editorial">{value}</strong> : null}
      {showValue && delta !== undefined && delta !== 0 ? (
        <p className="tiny muted">{formatDelta(delta)}</p>
      ) : null}
    </article>
  );
}

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section
      className="admin-club-operations__panel"
      aria-labelledby={`${title.replace(/\s+/g, "-").toLowerCase()}-title`}
    >
      <h5
        id={`${title.replace(/\s+/g, "-").toLowerCase()}-title`}
        className="h5 editorial"
      >
        {title}
      </h5>
      <div className="admin-club-operations__stats">{children}</div>
    </section>
  );
}

function Stat({
  label,
  value,
}: {
  label: string;
  value: number | string | null;
}) {
  return (
    <div className="admin-club-operations__stat">
      <span>{label}</span>
      {value != null && value !== "" ? <strong>{value}</strong> : null}
    </div>
  );
}

function ClosingRiskPanel({
  snapshot,
}: {
  snapshot: AdminClubOperationsSnapshot;
}) {
  const closingRisks = snapshot.closingRisks;
  const activeCount = closingRisks?.items.length ?? 0;
  const resolvedCount = closingRisks?.recentlyResolvedItems?.length ?? 0;

  return (
    <section
      className="admin-club-operations__closing-risk"
      aria-labelledby="admin-club-closing-risk-title"
    >
      <div className="admin-club-operations__closing-risk-header">
        <div>
          <h5 id="admin-club-closing-risk-title" className="h5 editorial">
            클로징 확인 필요
          </h5>
          {closingRiskCountsLabel(closingRisks) ? (
            <p className="tiny muted">{closingRiskCountsLabel(closingRisks)}</p>
          ) : null}
          {closingRisks?.trackingUnavailable ? (
            <p className="tiny muted">추적 상태 확인 불가</p>
          ) : null}
        </div>
      </div>

      {activeCount > 0 ? (
        <div className="admin-club-operations__closing-risk-summary">
          <p>확인 대상 {activeCount}건</p>
          <p className="small muted">
            개별 모임과 독서 내용은 클럽 운영 화면에서 확인합니다.
          </p>
        </div>
      ) : (
        <p className="admin-club-operations__closing-risk-empty muted">
          확인 필요한 모임 없음
        </p>
      )}

      {resolvedCount > 0 ? (
        <p className="admin-club-operations__closing-risk-resolved small muted">
          최근 해소 {resolvedCount}건
        </p>
      ) : null}
    </section>
  );
}
