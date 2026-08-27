import { Link } from "react-router";
import type { ReactNode } from "react";
import {
  aiFailureDelta,
  blockerNextAction,
  closingRiskAgeLabel,
  closingRiskBlockerLabel,
  closingRiskFirstDetectedLabel,
  closingRiskLastSeenLabel,
  closingRiskOccurrenceLabel,
  closingRiskOverflowCount,
  closingRiskResolvedAtLabel,
  closingRiskSafeStateCode,
  closingRiskStateLabel,
  closingRiskTrackingLabel,
  notificationFailureDelta,
  type AdminClubClosingRiskItem,
  type AdminClubOperationsSnapshot,
} from "@/features/platform-admin/model/platform-admin-club-operations-model";
import { ADMIN_COPY } from "@/features/platform-admin/model/admin-copy";

type AdminClubOperationsPageProps = {
  snapshot: AdminClubOperationsSnapshot;
  supportGrantCount?: number;
  supportGrantUnavailable?: boolean;
  onRetrySupportGrants?: () => void;
};

export function AdminClubOperationsPage({
  snapshot,
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
          <h2 id="admin-club-operations-title" className="h3 editorial">
            {snapshot.club.name} 운영 스냅샷
          </h2>
        </div>
        <span className="platform-admin-domain-status">
          {snapshot.readiness.state}
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
            <Stat
              label="최근 7일 실패"
              value={deviantCount(snapshot.notificationHealth.recentFailed7d)}
            />
            <Stat label="지난 7일 대비" value={deviantDelta(notifDelta)} />
            <Stat label="Pending" value={deviantCount(snapshot.notificationHealth.pending)} />
            <Stat
              label="Failed (전체)"
              value={deviantCount(snapshot.notificationHealth.failed)}
            />
            <Stat
              label="Dead (전체)"
              value={deviantCount(snapshot.notificationHealth.dead)}
            />
            <Link
              className="btn btn-ghost btn-sm"
              to={`/admin/notifications?clubId=${snapshot.club.clubId}`}
            >
              알림 ledger
            </Link>
          </Panel>

          <Panel title="AI usage">
            <Stat label="Active jobs" value={null} />
            <Stat
              label="최근 7일 실패"
              value={deviantCount(snapshot.aiUsage.failedRecentJobs)}
            />
            <Stat label="지난 7일 대비" value={deviantDelta(aiDelta)} />
            <Stat label="Cost" value={deviantCost(snapshot.aiUsage.costEstimateUsd)} />
            <Link
              className="btn btn-ghost btn-sm"
              to={`/admin/ai-ops?clubId=${snapshot.club.clubId}`}
            >
              AI 작업
            </Link>
          </Panel>
        </div>
      </section>

      <section
        className="admin-club-operations__group"
        aria-label="호스트 운영"
      >
        <h3 className="h4 editorial">호스트 운영</h3>
        <div className="admin-club-operations__grid">
          <Panel title="Session progress">
            <Stat label="예정" value={null} />
            <Stat label="닫힘" value={null} />
            <Stat label="공개 기록" value={null} />
            <Stat
              label="미완료 기록"
              value={deviantCount(snapshot.sessionProgress.incompleteRecordCount)}
            />
          </Panel>
          <Panel title="Member activity">
            <Stat label="활성" value={null} />
            <Stat label="휴면" value={deviantCount(snapshot.memberActivity.dormantCount)} />
            <Stat label="대기" value={deviantCount(snapshot.memberActivity.pendingViewerCount)} />
          </Panel>
        </div>
        <ClosingRiskPanel snapshot={snapshot} />
      </section>

      <div className="admin-club-operations__links">
        {snapshot.safeLinks.map((link) => (
          <Link
            key={`${link.kind}-${link.href}`}
            to={link.href}
            className="admin-club-operations__link"
          >
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
      <h4
        id={`${title.replace(/\s+/g, "-").toLowerCase()}-title`}
        className="h5 editorial"
      >
        {title}
      </h4>
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
  const visibleItems = closingRisks?.items.slice(0, 5) ?? [];
  const resolvedItems = closingRisks?.recentlyResolvedItems?.slice(0, 3) ?? [];
  const overflowCount = closingRiskOverflowCount(snapshot);

  return (
    <section
      className="admin-club-operations__closing-risk"
      aria-labelledby="admin-club-closing-risk-title"
    >
      <div className="admin-club-operations__closing-risk-header">
        <div>
          <h4 id="admin-club-closing-risk-title" className="h5 editorial">
            클로징 확인 필요
          </h4>
          {closingRiskCountsLabel(closingRisks) ? (
            <p className="tiny muted">{closingRiskCountsLabel(closingRisks)}</p>
          ) : null}
          {closingRisks?.trackingUnavailable ? (
            <p className="tiny muted">추적 상태 확인 불가</p>
          ) : null}
        </div>
      </div>

      {visibleItems.length > 0 ? (
        <div className="admin-club-operations__closing-risk-list">
          {visibleItems.map((item) => (
            <ClosingRiskRow
              key={item.sessionId}
              item={item}
              showUnavailableTracking={!closingRisks?.trackingUnavailable}
            />
          ))}
        </div>
      ) : (
        <p className="admin-club-operations__closing-risk-empty muted">
          확인 필요한 모임 없음
        </p>
      )}

      {overflowCount > 0 ? (
        <p className="admin-club-operations__closing-risk-overflow tiny muted">
          외 {overflowCount}개 모임
        </p>
      ) : null}

      {resolvedItems.length > 0 ? (
        <section
          className="admin-club-operations__closing-risk-resolved"
          aria-labelledby="admin-club-closing-risk-resolved-title"
        >
          <h5
            id="admin-club-closing-risk-resolved-title"
            className="h6 editorial"
          >
            최근 해소됨
          </h5>
          <div className="admin-club-operations__closing-risk-list">
            {resolvedItems.map((item) => (
              <ClosingRiskRow
                key={item.sessionId}
                item={item}
                variant="resolved"
              />
            ))}
          </div>
        </section>
      ) : null}
    </section>
  );
}

function ClosingRiskRow({
  item,
  variant = "active",
  showUnavailableTracking = true,
}: {
  item: AdminClubClosingRiskItem;
  variant?: "active" | "resolved";
  showUnavailableTracking?: boolean;
}) {
  const ageLabel = variant === "active" ? closingRiskAgeLabel(item) : null;
  const occurrenceLabel = closingRiskOccurrenceLabel(item);
  const trackingLabel = closingRiskTrackingLabel(item);
  const shouldShowTrackingLabel =
    variant === "active" &&
    (trackingLabel !== "추적 상태 확인 불가" || showUnavailableTracking);
  const resolvedAtLabel =
    variant === "resolved" ? closingRiskResolvedAtLabel(item) : null;
  const firstDetectedLabel =
    variant === "active" ? closingRiskFirstDetectedLabel(item) : null;
  const lastSeenLabel =
    variant === "active" ? closingRiskLastSeenLabel(item) : null;

  return (
    <article className="admin-club-operations__closing-risk-row">
      <div className="admin-club-operations__closing-risk-main">
        <strong>
          No.{String(item.sessionNumber).padStart(2, "0")} · {item.bookTitle}
        </strong>
        <span>{resolvedAtLabel ?? item.meetingDate}</span>
      </div>
      <span
        className="admin-club-operations__closing-risk-badge"
        data-state={closingRiskSafeStateCode(item.overallState)}
      >
        {closingRiskStateLabel(item.overallState)}
      </span>
      <span className="admin-club-operations__closing-risk-blocker">
        {closingRiskBlockerLabel(item.primaryBlocker)}
      </span>
      {ageLabel ? (
        <span className="admin-club-operations__closing-risk-age">
          {ageLabel}
        </span>
      ) : null}
      {firstDetectedLabel ? (
        <span className="admin-club-operations__closing-risk-date">
          {firstDetectedLabel}
        </span>
      ) : null}
      {lastSeenLabel ? (
        <span className="admin-club-operations__closing-risk-date">
          {lastSeenLabel}
        </span>
      ) : null}
      {occurrenceLabel ? (
        <span className="admin-club-operations__closing-risk-repeat">
          {occurrenceLabel}
        </span>
      ) : null}
      {shouldShowTrackingLabel ? (
        <span className="admin-club-operations__closing-risk-tracking">
          {trackingLabel}
        </span>
      ) : null}
      <Link className="btn btn-ghost btn-sm" to={item.hostClosingHref}>
        호스트 클로징 보드
      </Link>
    </article>
  );
}
