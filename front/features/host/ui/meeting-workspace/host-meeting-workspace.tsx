import { useLayoutEffect, useRef, type ReactNode } from "react";
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
import type { HostSessionEditorLinkComponent } from "@/features/host/ui/session-editor/session-editor-links";
import type {
  WorkspacePendingUndo,
  WorkspaceRestoreNotice,
  WorkspaceUndoConfirm,
} from "@/features/host/ui/session-workspace/workspace-undo-bar";
import { MeetingFocusFacts, type MeetingAudienceProjection } from "./meeting-focus-facts";
import { MeetingRelatedWork } from "./meeting-related-work";

export type HostMeetingWorkspaceProps = {
  view: HostMeetingWorkspaceView;
  header: WorkspaceHeaderModel;
  facts: readonly HostFocusFact[];
  focusContent?: ReactNode;
  relatedWork?: ReactNode;
  projections?: readonly MeetingAudienceProjection[];
  recordReadiness?: HostMeetingRecordReadiness;
  panel?: ReactNode;
  recovery?: ReactNode;
  publicRecordHref?: string | null;
  onCreateRevision?: (() => void) | null;
  reverseAction?: { label: string; onClick: () => void } | null;
  location?: HostSessionWorkspaceLocation;
  onLocationChange?: (next: HostSessionWorkspaceLocation) => void;
  onOpenBasic?: () => void;
  onOpenHistory?: () => void;
  pendingUndo?: WorkspacePendingUndo | null;
  undoConfirm?: WorkspaceUndoConfirm | null;
  restoreNotice?: WorkspaceRestoreNotice | null;
  onPrimaryAction: () => void;
  onRetryReadiness?: () => void;
  LinkComponent?: HostSessionEditorLinkComponent;
};

const defaultLocation: HostSessionWorkspaceLocation = { panel: "focus", source: "manual" };

function sessionViewFromMeeting(view: HostMeetingWorkspaceView): HostSessionWorkspaceView {
  const panel = view.primaryAction.task === "attendance"
    ? "attendance" as const
    : view.primaryAction.task === "records"
      ? "records" as const
      : "focus" as const;
  return {
    statusLabel: view.statusLabel,
    primaryAction: {
      kind: view.primaryAction.kind,
      label: view.primaryAction.label,
      panel,
    },
    progress: [],
    publicationReady: view.publicationReady === true,
  };
}

export function HostMeetingWorkspace({
  view,
  header,
  facts,
  focusContent,
  relatedWork,
  projections,
  recordReadiness,
  panel,
  recovery,
  publicRecordHref = null,
  onCreateRevision = null,
  reverseAction = null,
  location = defaultLocation,
  onLocationChange,
  onOpenBasic,
  onOpenHistory,
  pendingUndo = null,
  undoConfirm = null,
  restoreNotice = null,
  onPrimaryAction,
  onRetryReadiness,
  LinkComponent,
}: HostMeetingWorkspaceProps) {
  const workspaceRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const control = workspaceRef.current?.querySelector<HTMLElement>(
      ".rm-host-session-workspace__cta--desktop, .rm-host-session-workspace__cta--mobile, .btn-primary",
    );
    if (control) commitHostMeetingFirstUsable();
  }, [view.primaryAction.kind, view.primaryAction.label]);

  return (
    <main ref={workspaceRef} className="rm-focus-deck">
      <HostSessionWorkspace
        view={sessionViewFromMeeting(view)}
        header={header}
        location={location}
        onLocationChange={(next) => {
          if (onLocationChange) {
            onLocationChange(next);
            return;
          }
          if (next.panel === "basic") onOpenBasic?.();
          if (next.panel === "history") onOpenHistory?.();
        }}
        onPrimaryAction={onPrimaryAction}
        primaryActionDisabled={view.primaryAction.disabled}
        primaryActionReason={view.primaryAction.reason ?? null}
        publicRecordHref={publicRecordHref}
        onCreateRevision={onCreateRevision}
        reverseAction={reverseAction}
        facts={(
          <MeetingFocusFacts
            facts={facts}
            projections={projections}
            recordReadiness={recordReadiness}
            onRetryReadiness={onRetryReadiness}
          />
        )}
        relatedWork={relatedWork ?? <MeetingRelatedWork tasks={view.relatedTasks} />}
        recovery={recovery}
        pendingUndo={pendingUndo}
        undoConfirm={undoConfirm}
        restoreNotice={restoreNotice}
        focusContent={focusContent}
        panel={panel}
        LinkComponent={LinkComponent}
      />
    </main>
  );
}
