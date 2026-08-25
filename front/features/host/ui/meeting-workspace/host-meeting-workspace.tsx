import { useEffect, useRef, type ComponentType, type ReactNode } from "react";
import type { HostMeetingTask, HostMeetingTaskLink } from "@/features/host/model/host-session-workspace-model";
import { formatDateTimeLabel } from "@/shared/ui/readmates-display";
import { MeetingJudgmentRail, type MeetingJudgmentModel, type MeetingPrimaryActionModel } from "./meeting-judgment-rail";
import { MeetingLocalNavigation, type MeetingLinkProps } from "./meeting-local-navigation";
import { MeetingMasthead, type MeetingIdentityModel } from "./meeting-masthead";

export type MeetingPanelViewModel =
  | { kind: "loading"; task: HostMeetingTask }
  | { kind: "known-empty"; task: HostMeetingTask; content: ReactNode }
  | { kind: "unavailable"; task: HostMeetingTask }
  | { kind: "stale-cached"; task: HostMeetingTask; content: ReactNode; observedAt: string }
  | { kind: "ready"; task: HostMeetingTask; content: ReactNode };

export type MeetingAnnouncement = {
  kind: "status" | "alert";
  message: string;
};

export type HostMeetingWorkspaceProps = {
  identity: MeetingIdentityModel;
  tasks: ReadonlyArray<HostMeetingTaskLink>;
  activeTask: HostMeetingTask;
  primaryAction: MeetingPrimaryActionModel;
  panel: MeetingPanelViewModel;
  judgment: MeetingJudgmentModel;
  announcements: ReadonlyArray<MeetingAnnouncement>;
  LinkComponent: ComponentType<MeetingLinkProps>;
  onTaskLinkActivated: (task: HostMeetingTask) => void;
  onPrimaryAction: () => void;
  onRetryPanel: () => void;
};

const panelCopy: Record<HostMeetingTask, { label: string; empty: string }> = {
  overview: { label: "개요", empty: "아직 표시할 개요가 없습니다" },
  responses: { label: "참석 응답", empty: "아직 참석 응답이 없습니다" },
  attendance: { label: "실제 출석", empty: "아직 출석 대상이 없습니다" },
  records: { label: "모임 기록", empty: "아직 모임 기록이 없습니다" },
  notifications: { label: "알림", empty: "아직 발송한 알림이 없습니다" },
  history: { label: "변경 내역", empty: "아직 변경 기록이 없습니다" },
};

function MeetingPanel({ panel, onRetry }: { panel: MeetingPanelViewModel; onRetry: () => void }) {
  const copy = panelCopy[panel.task];
  if (panel.kind === "loading") {
    return <p role="status" className="rm-meeting-panel-state">{copy.label}을 불러오는 중입니다.</p>;
  }
  if (panel.kind === "known-empty") {
    return <div role="status" className="rm-meeting-panel-state"><p>{copy.empty}</p>{panel.content}</div>;
  }
  if (panel.kind === "unavailable") {
    return (
      <div role="alert" className="rm-meeting-panel-state is-error">
        <p>{copy.label}을 불러오지 못했습니다.</p>
        <button type="button" className="btn btn-quiet btn-sm" onClick={onRetry}>{copy.label} 다시 시도</button>
      </div>
    );
  }
  if (panel.kind === "stale-cached") {
    return (
      <div className="rm-meeting-panel-state__stale">
        <div role="status" className="rm-meeting-panel-state">
          {formatDateTimeLabel(panel.observedAt)}에 확인한 내용을 표시합니다. 최신 확인이 필요한 행동은 잠시 사용할 수 없습니다.
          <button type="button" className="btn btn-quiet btn-sm" onClick={onRetry}>최신 내용 확인</button>
        </div>
        {panel.content}
      </div>
    );
  }
  return <>{panel.content}</>;
}

export function HostMeetingWorkspace({
  identity,
  tasks,
  activeTask,
  primaryAction,
  panel,
  judgment,
  announcements,
  LinkComponent,
  onTaskLinkActivated,
  onPrimaryAction,
  onRetryPanel,
}: HostMeetingWorkspaceProps) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const selectedTaskRef = useRef<HostMeetingTask | null>(null);

  useEffect(() => {
    if (selectedTaskRef.current !== activeTask) return;
    headingRef.current?.focus();
    selectedTaskRef.current = null;
  }, [activeTask]);

  return (
    <div className={`rm-meeting-folio rm-meeting-folio--${activeTask}`}>
      <MeetingMasthead identity={identity} headingRef={headingRef} />
      <div className="rm-meeting-folio__mobile-action">
        <button type="button" className="btn btn-primary" disabled={primaryAction.disabled} onClick={onPrimaryAction}>
          {primaryAction.label}
        </button>
        {primaryAction.reason ? <p className="small muted">{primaryAction.reason}</p> : null}
      </div>
      <MeetingLocalNavigation
        tasks={tasks}
        activeTask={activeTask}
        LinkComponent={LinkComponent}
        onTaskLinkActivated={(task) => {
          selectedTaskRef.current = task;
          onTaskLinkActivated(task);
        }}
      />
      {announcements.map((announcement) => (
        <p key={`${announcement.kind}:${announcement.message}`} role={announcement.kind} className={`rm-meeting-folio__announcement is-${announcement.kind}`}>
          {announcement.message}
        </p>
      ))}
      <div className="rm-meeting-folio__layout">
        <main className="rm-meeting-folio__work" aria-label="현재 모임 작업">
          <MeetingPanel panel={panel} onRetry={onRetryPanel} />
        </main>
        <MeetingJudgmentRail judgment={judgment} primaryAction={primaryAction} onPrimaryAction={onPrimaryAction} />
      </div>
    </div>
  );
}
