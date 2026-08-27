import { useLayoutEffect, useRef, type ReactNode } from "react";
import type {
  HostFocusFact,
  HostMeetingWorkspaceView,
  HostSessionWorkspaceLocation,
  HostSessionWorkspaceView,
} from "@/features/host/model/host-session-workspace-model";
import type { HostMeetingDiaryView } from "@/features/host/model/host-meeting-diary-model";
import type { HostMeetingRecordReadiness } from "@/features/host/model/host-meeting-record-readiness";
import { commitHostMeetingFirstUsable } from "@/shared/observability/host-meeting-performance";
import { HostSessionWorkspace } from "@/features/host/ui/session-workspace/host-session-workspace";
import type { WorkspaceHeaderModel } from "@/features/host/ui/session-workspace/workspace-header";
import type { HostSessionEditorLinkComponent } from "@/features/host/ui/session-editor/session-editor-links";
import { DefaultLinkComponent } from "@/features/host/ui/session-editor/session-editor-links";
import type {
  WorkspacePendingUndo,
  WorkspaceRestoreNotice,
  WorkspaceUndoConfirm,
} from "@/features/host/ui/session-workspace/workspace-undo-bar";
import { MeetingFocusFacts, type MeetingAudienceProjection } from "./meeting-focus-facts";
import { MeetingRelatedWork } from "./meeting-related-work";
import { MeetingDiaryTimeline } from "./meeting-diary-timeline";
import "./meeting-diary.css";

export type MeetingDiaryAdjacentSession = {
  href: string;
  sessionNumber: number;
};

export type HostMeetingWorkspaceProps = {
  view: HostMeetingWorkspaceView;
  diary: HostMeetingDiaryView;
  header: WorkspaceHeaderModel;
  facts: readonly HostFocusFact[];
  focusContent?: ReactNode;
  relatedWork?: ReactNode;
  projections?: readonly MeetingAudienceProjection[];
  recordReadiness?: HostMeetingRecordReadiness;
  panel?: ReactNode;
  recovery?: ReactNode;
  publicRecordHref?: string | null;
  memberViewHref?: string | null;
  adjacentSessions?: {
    previous?: MeetingDiaryAdjacentSession | null;
    next?: MeetingDiaryAdjacentSession | null;
  } | null;
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

function MeetingDiaryPager({
  currentSessionNumber,
  adjacent,
  LinkComponent,
}: {
  currentSessionNumber: number | null;
  adjacent: NonNullable<HostMeetingWorkspaceProps["adjacentSessions"]>;
  LinkComponent: HostSessionEditorLinkComponent;
}) {
  const previous = adjacent.previous ?? null;
  const next = adjacent.next ?? null;
  if (!previous && !next) return null;

  return (
    <nav className="rm-meeting-diary__pager" aria-label="회차">
      <span className="rm-meeting-diary__pager-chevron" aria-hidden="true">‹</span>
      {previous ? (
        <LinkComponent to={previous.href} className="rm-meeting-diary__pager-link">
          No.{previous.sessionNumber}
        </LinkComponent>
      ) : (
        <span className="rm-meeting-diary__pager-gap" aria-hidden="true" />
      )}
      {currentSessionNumber == null ? null : (
        <>
          <span className="rm-meeting-diary__pager-sep" aria-hidden="true">·</span>
          <span className="rm-meeting-diary__pager-current">No.{currentSessionNumber}</span>
        </>
      )}
      {next ? (
        <>
          <span className="rm-meeting-diary__pager-sep" aria-hidden="true">·</span>
          <LinkComponent to={next.href} className="rm-meeting-diary__pager-link">
            No.{next.sessionNumber}
          </LinkComponent>
        </>
      ) : null}
      <span className="rm-meeting-diary__pager-chevron" aria-hidden="true">›</span>
    </nav>
  );
}

export function HostMeetingWorkspace({
  view,
  diary,
  header,
  facts,
  focusContent,
  relatedWork,
  projections,
  recordReadiness,
  panel,
  recovery,
  publicRecordHref = null,
  memberViewHref = null,
  adjacentSessions = null,
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
  LinkComponent = DefaultLinkComponent,
}: HostMeetingWorkspaceProps) {
  const workspaceRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const control = workspaceRef.current?.querySelector<HTMLElement>(
      ".rm-host-session-workspace__cta--desktop, .rm-host-session-workspace__cta--mobile, .btn-primary",
    );
    if (control) commitHostMeetingFirstUsable();
  }, [view.primaryAction.kind, view.primaryAction.label]);

  const showPager = Boolean(adjacentSessions?.previous || adjacentSessions?.next);

  return (
    <main ref={workspaceRef} className="rm-meeting-diary">
      {showPager && adjacentSessions ? (
        <MeetingDiaryPager
          currentSessionNumber={header.sessionNumber}
          adjacent={adjacentSessions}
          LinkComponent={LinkComponent}
        />
      ) : null}
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
        leading={(
          <div className="rm-meeting-diary__left">
            {memberViewHref ? (
              <LinkComponent
                to={memberViewHref}
                className="btn btn-ghost btn-sm rm-meeting-diary__member-view"
              >
                멤버 시야로 보기
              </LinkComponent>
            ) : null}
            {projections && projections.length > 0 ? (
              <div className="rm-meeting-diary__visibility" role="group" aria-label="공개 상태">
                <dl>
                  {projections.map((item) => (
                    <div key={item.audience}>
                      <dt>{item.audience}</dt>
                      <dd>{item.result}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            ) : null}
            <MeetingDiaryTimeline diary={diary} LinkComponent={LinkComponent} />
          </div>
        )}
        facts={(
          <div className="rm-meeting-diary__step-content">
            <MeetingFocusFacts
              facts={facts}
              recordReadiness={recordReadiness}
              onRetryReadiness={onRetryReadiness}
            />
          </div>
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
