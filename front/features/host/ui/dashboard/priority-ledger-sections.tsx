import type { ReactNode } from "react";
import type {
  HostDashboardChecklistView,
  HostDashboardLedgerMetric,
} from "@/features/host/model/host-dashboard-model";
import type { HostDashboardLinkComponent } from "./types";

function checklistRow(item: HostDashboardChecklistView["all"][number]) {
  return (
    <li key={item.id} className="rm-host-flow__step">
      <span className="rm-host-flow__when">{item.when}</span>
      <span className="rm-host-flow__step-copy">
        <strong>{item.title}</strong>
        <span>{item.helper}</span>
      </span>
      <span className={`badge badge-${item.state === "complete" ? "ok" : item.state === "pending" ? "warn" : "default"} badge-dot`}>
        {item.statusLabel}
      </span>
    </li>
  );
}

export function HostTodayBoard({
  mobile,
  currentSession,
  priorityBoard,
}: {
  mobile: boolean;
  currentSession: ReactNode;
  priorityBoard: ReactNode;
}) {
  return (
    <section
      className={`rm-host-today${mobile ? " rm-host-today--mobile" : ""}`}
      aria-labelledby="host-today-title"
    >
      <h2 id="host-today-title" className="rm-sr-only">
        오늘의 운영
      </h2>
      <div className="rm-host-today__current">{currentSession}</div>
      <div className="rm-host-today__priority">{priorityBoard}</div>
    </section>
  );
}

export function HostPriorityLedger({
  metrics,
  recordRows,
  recordError,
  LinkComponent,
}: {
  metrics: HostDashboardLedgerMetric[];
  recordRows: ReactNode;
  recordError: boolean;
  LinkComponent: HostDashboardLinkComponent;
}) {
  return (
    <section className="rm-host-ledger" aria-labelledby="host-ledger-title">
      <header className="rm-host-section-heading">
        <div>
          <div className="eyebrow">기록과 마감</div>
          <h2 id="host-ledger-title">처리 대기 원장</h2>
        </div>
        <LinkComponent to="/app/host/sessions" className="btn btn-quiet btn-sm">
          세션 기록 전체 보기
        </LinkComponent>
      </header>

      <dl className="rm-host-ledger__metrics">
        {metrics.map((metric) => (
          <div key={metric.id} className={`rm-host-ledger__metric rm-host-ledger__metric--${metric.tone}`}>
            <dt>{metric.label}</dt>
            <dd>
              <strong>{metric.value}</strong>
              <span>{metric.stateLabel}</span>
            </dd>
          </div>
        ))}
      </dl>

      <div className="rm-host-ledger__records">
        {recordError ? (
          <div className="rm-host-ledger__error" role="alert">
            <span>기록 상태를 불러오지 못했습니다.</span>
            <LinkComponent to="/app/host/sessions" className="btn btn-quiet btn-sm">
              세션 기록 열기
            </LinkComponent>
          </div>
        ) : recordRows}
      </div>
    </section>
  );
}

export function HostOperationFlow({
  upcomingSessions,
  checklist,
}: {
  upcomingSessions: ReactNode;
  checklist: HostDashboardChecklistView;
}) {
  return (
    <section className="rm-host-flow" aria-labelledby="host-flow-title">
      <header className="rm-host-section-heading">
        <div>
          <div className="eyebrow">다음 순서</div>
          <h2 id="host-flow-title">다음 세션과 운영 흐름</h2>
        </div>
      </header>

      <div className="rm-host-flow__upcoming">{upcomingSessions}</div>
      <ol className="rm-host-flow__highlights" aria-label="현재 운영 단계">
        {checklist.highlighted.map(checklistRow)}
      </ol>
      <details className="rm-host-flow__details">
        <summary>전체 운영 일정 {checklist.all.length}단계</summary>
        <ol aria-label="전체 운영 일정">
          {checklist.all.map(checklistRow)}
        </ol>
      </details>
    </section>
  );
}

export function HostOperationsTools({
  notifications,
  members,
  invitations,
  quickActions,
}: {
  notifications: ReactNode;
  members: ReactNode;
  invitations: ReactNode;
  quickActions: ReactNode;
}) {
  return (
    <section className="rm-host-tools" aria-labelledby="host-tools-title">
      <header className="rm-host-section-heading">
        <div>
          <div className="eyebrow">관리</div>
          <h2 id="host-tools-title">운영 도구</h2>
        </div>
      </header>
      <div className="rm-host-tools__list">
        <div className="rm-host-tools__row">{notifications}</div>
        <div className="rm-host-tools__row">{members}</div>
        <div className="rm-host-tools__row">{invitations}</div>
        <div className="rm-host-tools__row">{quickActions}</div>
      </div>
    </section>
  );
}
