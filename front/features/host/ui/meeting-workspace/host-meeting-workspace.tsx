import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import type {
  HostFocusFact,
  HostMeetingWorkspaceView,
  HostSessionWorkspaceLocation,
  HostSessionWorkspaceView,
} from "@/features/host/model/host-session-workspace-model";
import type { HostMeetingRecordReadiness } from "@/features/host/model/host-meeting-record-readiness";
import { commitHostMeetingFirstUsable } from "@/shared/observability/host-meeting-performance";
import { HostSessionWorkspace } from "@/features/host/ui/session-workspace/host-session-workspace";
import type { WorkspaceHeaderModel } from "@/features/host/ui/session-workspace/workspace-header";
import { type MeetingAudienceProjection } from "./meeting-focus-facts";
import { MeetingRelatedWork } from "./meeting-related-work";

export type HostMeetingWorkspaceProps = {
  view: HostMeetingWorkspaceView;
  header: WorkspaceHeaderModel;
  facts: readonly HostFocusFact[];
  focusContent?: ReactNode;
  relatedWork?: ReactNode;
  recordReadiness?: HostMeetingRecordReadiness;
  panel?: ReactNode;
  recovery?: ReactNode;
  onPrimaryAction: () => void;
  onRetryReadiness?: () => void;
};

function sessionViewFromMeeting(view: HostMeetingWorkspaceView): HostSessionWorkspaceView {
  const panel = view.primaryAction.task === "attendance"
    ? "attendance" as const
    : view.primaryAction.task === "records"
      ? "records" as const
      : "focus" as const;
  return {
    statusLabel: view.statusLabel === "공개 완료" ? "게스트·멤버 노트 게시 완료" : view.statusLabel,
    primaryAction: {
      kind: view.primaryAction.kind,
      label: view.primaryAction.label,
      panel,
    },
    progress: [],
    publicationReady: view.publicationReady === true,
  };
}

function audienceProjections(view: HostMeetingWorkspaceView): readonly MeetingAudienceProjection[] {
  return [
    { audience: "호스트", result: "운영 기록과 초안 계속 편집" },
    {
      audience: "게스트·멤버",
      result: view.lifecycle === "PUBLISHED" ? "게스트·멤버 노트에서 읽음" : "허용된 아카이브에서 읽음",
    },
    {
      audience: "공개 기록",
      result: view.publicationReady ? "공개 기록에 게시" : "공개 기록에 게시 안 됨",
    },
  ];
}

export function HostMeetingWorkspace({
  view,
  header,
  facts,
  focusContent,
  relatedWork,
  recordReadiness,
  panel,
  recovery,
  onPrimaryAction,
  onRetryReadiness,
}: HostMeetingWorkspaceProps) {
  const workspaceRef = useRef<HTMLDivElement>(null);
  const [location, setLocation] = useState<HostSessionWorkspaceLocation>({
    panel: "focus",
    source: "manual",
  });

  useLayoutEffect(() => {
    const control = workspaceRef.current?.querySelector<HTMLElement>(
      ".rm-host-session-workspace__cta--desktop, .rm-host-session-workspace__cta--mobile, .btn-primary",
    );
    if (control) commitHostMeetingFirstUsable();
  }, [view.primaryAction.kind, view.primaryAction.label]);

  return (
    <div ref={workspaceRef} className="rm-focus-deck">
      <HostSessionWorkspace
        view={sessionViewFromMeeting(view)}
        header={header}
        location={location}
        onLocationChange={setLocation}
        onPrimaryAction={onPrimaryAction}
        primaryActionDisabled={view.primaryAction.disabled}
        primaryActionReason={view.primaryAction.reason ?? null}
        facts={facts}
        projections={audienceProjections(view)}
        recordReadiness={recordReadiness}
        onRetryReadiness={onRetryReadiness}
        relatedWork={relatedWork ?? <MeetingRelatedWork tasks={view.relatedTasks} />}
        recovery={recovery}
        focusContent={focusContent}
        panel={panel}
        basicPanel={null}
        historyPanel={null}
      />
    </div>
  );
}
