import type { ComponentType, ReactNode } from "react";
import type { HostMeetingTask, HostMeetingTaskLink } from "@/features/host/model/host-session-workspace-model";
import type { PanelLoadState } from "@/features/host/model/host-meeting-panel-state";
import { formatDateTimeLabel } from "@/shared/ui/readmates-display";

type LinkProps = {
  to: string;
  className?: string;
  "aria-current"?: "page";
  children: ReactNode;
};

const taskCopy: Record<Extract<HostMeetingTask, "records" | "notifications" | "history">, {
  label: string;
  empty: string;
}> = {
  records: { label: "모임 기록", empty: "아직 기록 초안이 없습니다" },
  notifications: { label: "알림", empty: "아직 발송한 알림이 없습니다" },
  history: { label: "변경 내역", empty: "아직 변경 기록이 없습니다" },
};

function PanelState({
  task,
  panel,
}: {
  task: Extract<HostMeetingTask, "records" | "notifications" | "history">;
  panel: PanelLoadState<ReactNode>;
}) {
  const copy = taskCopy[task];
  if (panel.kind === "loading") {
    return <p role="status" className="small">{copy.label}을 불러오는 중입니다.</p>;
  }
  if (panel.kind === "known-empty") {
    return (
      <>
        <p role="status" className="small">{copy.empty}</p>
        {task === "notifications" ? panel.data : null}
      </>
    );
  }
  if (panel.kind === "unavailable") {
    return (
      <div role="alert" className="surface-quiet stack" style={{ padding: 18 }}>
        <p className="small" style={{ margin: 0 }}>{copy.label}을 불러오지 못했습니다.</p>
        <div>
          <button type="button" className="btn btn-quiet btn-sm" onClick={panel.retry}>
            {copy.label} 다시 시도
          </button>
        </div>
      </div>
    );
  }
  if (panel.kind === "stale-cached") {
    return (
      <div className="stack" style={{ "--stack": "12px" } as React.CSSProperties}>
        <div className="surface-quiet small" role="status" style={{ padding: 14 }}>
          <span>{formatDateTimeLabel(panel.observedAt)}에 확인한 내용을 표시합니다. 최신 확인이 필요한 행동은 잠시 사용할 수 없습니다.</span>{" "}
          <button type="button" className="btn btn-quiet btn-sm" onClick={panel.retry}>최신 내용 확인</button>
        </div>
        {panel.data}
      </div>
    );
  }
  return <>{panel.data}</>;
}

export function HostMeetingWorkspaceRouteFrame({
  title,
  activeTask,
  taskLinks = [],
  baseContent,
  panel = null,
  showTitle = true,
  LinkComponent = ({ to, children, ...props }: LinkProps) => <a href={to} {...props}>{children}</a>,
}: {
  title: string;
  activeTask: HostMeetingTask;
  taskLinks?: ReadonlyArray<HostMeetingTaskLink>;
  baseContent: ReactNode;
  panel?: PanelLoadState<ReactNode> | null;
  showTitle?: boolean;
  LinkComponent?: ComponentType<LinkProps>;
}) {
  const heavyTask = activeTask === "records" || activeTask === "notifications" || activeTask === "history"
    ? activeTask
    : null;
  return (
    <div className="rm-host-meeting-workspace-route-frame">
      <header className="container page-header-compact">
        {showTitle ? (
          <h1 className="h1 editorial" style={{ overflowWrap: "anywhere" }}>{title}</h1>
        ) : null}
        {taskLinks.length > 0 ? (
          <nav aria-label="모임 작업 목차" className="row wrap" style={{ gap: 8 }}>
            {taskLinks.map((item) => (
              <LinkComponent
                key={item.task}
                to={item.href}
                className="btn btn-quiet btn-sm"
                aria-current={item.task === activeTask ? "page" : undefined}
              >
                {item.label}{item.badge ? ` · ${item.badge}` : ""}
              </LinkComponent>
            ))}
          </nav>
        ) : null}
      </header>
      <section className="container stack" style={{ "--stack": "16px" } as React.CSSProperties}>
        {baseContent}
        {heavyTask && panel ? <PanelState task={heavyTask} panel={panel} /> : null}
      </section>
    </div>
  );
}
