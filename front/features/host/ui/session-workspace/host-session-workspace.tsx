import { useEffect, useRef, type ReactNode } from "react";
import type {
  HostSessionWorkspaceLocation,
  HostSessionWorkspacePanel,
  HostSessionWorkspaceView,
} from "@/features/host/model/host-session-workspace-model";
import type { HostSessionEditorLinkComponent } from "@/features/host/ui/session-editor/session-editor-links";
import { DefaultLinkComponent } from "@/features/host/ui/session-editor/session-editor-links";
import { WorkspaceFocusCard } from "./workspace-focus-card";
import { WorkspaceHeader, type WorkspaceHeaderModel } from "./workspace-header";
import { WorkspacePanel } from "./workspace-panel";
import {
  WorkspaceUndoBar,
  type WorkspacePendingUndo,
  type WorkspaceRestoreNotice,
  type WorkspaceUndoConfirm,
} from "./workspace-undo-bar";

export type HostSessionWorkspaceProps = {
  view: HostSessionWorkspaceView;
  header: WorkspaceHeaderModel;
  location: HostSessionWorkspaceLocation;
  onLocationChange: (next: HostSessionWorkspaceLocation) => void;
  onPrimaryAction: () => void;
  primaryActionDisabled?: boolean;
  primaryActionReason?: string | null;
  publicRecordHref?: string | null;
  reverseAction?: { label: string; onClick: () => void } | null;
  onCreateRevision?: (() => void) | null;
  error?: { message: string; onRetry: () => void } | null;
  pendingUndo?: WorkspacePendingUndo | null;
  undoConfirm?: WorkspaceUndoConfirm | null;
  restoreNotice?: WorkspaceRestoreNotice | null;
  draftSaveLabel?: string | null;
  descriptionOverride?: string | null;
  focusContent?: ReactNode;
  relatedWork?: ReactNode;
  facts?: ReactNode;
  recovery?: ReactNode;
  panel?: ReactNode;
  basicPanel?: ReactNode;
  attendancePanel?: ReactNode;
  recordsPanel?: ReactNode;
  historyPanel?: ReactNode;
  chrome?: boolean;
  LinkComponent?: HostSessionEditorLinkComponent;
};

function focusLocation(): HostSessionWorkspaceLocation {
  return { panel: "focus", source: "manual" };
}

function panelLocation(panel: HostSessionWorkspacePanel, source: HostSessionWorkspaceLocation["source"] = "manual"): HostSessionWorkspaceLocation {
  return { panel, source };
}

function hostStatusLabel(label: HostSessionWorkspaceView["statusLabel"]): "모임 작성 중" | "멤버와 준비 중" | "기록 정리 중" | "공개 완료" {
  if (label === "게스트·멤버 노트 게시 완료") return "공개 완료";
  return label;
}

export function HostSessionWorkspace({
  view,
  header,
  location,
  onLocationChange,
  onPrimaryAction,
  primaryActionDisabled = false,
  primaryActionReason = null,
  publicRecordHref = null,
  reverseAction = null,
  onCreateRevision = null,
  error = null,
  pendingUndo = null,
  undoConfirm = null,
  restoreNotice = null,
  draftSaveLabel = null,
  descriptionOverride = null,
  focusContent,
  relatedWork,
  facts,
  recovery,
  panel,
  basicPanel = null,
  attendancePanel,
  recordsPanel,
  historyPanel = null,
  chrome = true,
  LinkComponent = DefaultLinkComponent,
}: HostSessionWorkspaceProps) {
  const basicOpen = location.panel === "basic";
  const historyOpen = location.panel === "history";
  const attendanceOpen = location.panel === "attendance";
  const recordsOpen = location.panel === "records";
  const hasSheets = basicPanel != null || historyPanel != null;
  const sheetOpen = hasSheets && (basicOpen || historyOpen);
  const statusLabel = hostStatusLabel(view.statusLabel);
  const triggerRef = useRef<HTMLElement | null>(null);

  const changePanel = (next: HostSessionWorkspaceLocation) => {
    const openingOverlay = (next.panel === "basic" || next.panel === "history") && !sheetOpen;
    if (openingOverlay && document.activeElement instanceof HTMLElement) {
      triggerRef.current = document.activeElement;
    }
    onLocationChange(next);
  };

  const sheetWasOpenRef = useRef(false);
  useEffect(() => {
    if (sheetOpen) {
      sheetWasOpenRef.current = true;
      return;
    }
    if (sheetWasOpenRef.current) {
      triggerRef.current?.focus();
      sheetWasOpenRef.current = false;
    }
  }, [sheetOpen]);

  const closeSheet = () => changePanel(focusLocation());
  const primaryLabel = view.primaryAction.label;
  const publishBlocked = view.primaryAction.kind === "PUBLISH_RECORD" && !view.publicationReady;
  const disabled = primaryActionDisabled || publishBlocked;
  const showPublicLink = Boolean(publicRecordHref) && view.primaryAction.kind === "VIEW_PUBLIC_RECORD";

  return (
    <div className="rm-host-session-workspace">
      <div className="rm-host-session-workspace__chrome" inert={sheetOpen || undefined}>
      <div className="rm-host-session-workspace__frame">
        {chrome ? (
          <WorkspaceHeader
            header={header}
            statusLabel={statusLabel}
            basicOpen={basicOpen}
            historyOpen={historyOpen}
            onOpenBasic={() => changePanel(basicOpen ? focusLocation() : panelLocation("basic"))}
            onOpenHistory={() => changePanel(historyOpen ? focusLocation() : panelLocation("history"))}
            LinkComponent={LinkComponent}
          />
        ) : null}

        <div className="rm-host-session-workspace__layout">
          <div className="rm-host-session-workspace__main">
            {chrome ? (
              <WorkspaceFocusCard
                view={view}
                onPrimaryAction={onPrimaryAction}
                primaryActionDisabled={disabled}
                primaryActionReason={primaryActionReason}
                publicRecordHref={publicRecordHref}
                reverseAction={reverseAction}
                onCreateRevision={onCreateRevision}
                error={error}
                descriptionOverride={descriptionOverride}
                LinkComponent={LinkComponent}
              >
                {focusContent}
              </WorkspaceFocusCard>
            ) : focusContent}

            {chrome ? facts : null}

            {chrome ? relatedWork : null}

            {draftSaveLabel ? (
              <p className="small rm-host-session-workspace__save-state">{draftSaveLabel}</p>
            ) : null}

            {recovery}

            <WorkspaceUndoBar
              pendingUndo={pendingUndo}
              confirm={undoConfirm}
              restoreNotice={restoreNotice}
            />

            {attendancePanel ? (
              <WorkspacePanel
                id="workspace-panel-attendance"
                title="출석"
                eyebrow="참석 명단"
                expanded={attendanceOpen}
                onToggle={() => changePanel(attendanceOpen ? focusLocation() : panelLocation("attendance"))}
              >
                {attendancePanel}
              </WorkspacePanel>
            ) : null}

            {recordsPanel ? (
              <WorkspacePanel
                id="workspace-panel-records"
                title="기록"
                eyebrow="모임 기록"
                expanded={recordsOpen}
                onToggle={() => changePanel(recordsOpen ? focusLocation() : panelLocation("records", location.source))}
              >
                {recordsPanel}
              </WorkspacePanel>
            ) : null}

            {panel}
          </div>
        </div>
      </div>

      {chrome ? (
      <div className="rm-host-session-workspace__sticky-cta rm-host-session-workspace__footer-cta">
        {showPublicLink && publicRecordHref ? (
          <LinkComponent
            to={publicRecordHref}
            className="btn btn-primary rm-host-session-workspace__cta--mobile"
          >
            {primaryLabel}
          </LinkComponent>
        ) : (
          <button
            type="button"
            className="btn btn-primary rm-host-session-workspace__cta--mobile"
            disabled={disabled}
            onClick={onPrimaryAction}
          >
            {primaryLabel}
          </button>
        )}
      </div>
      ) : null}
      </div>

      {hasSheets ? (
        <>
          {basicPanel != null ? (
            <WorkspacePanel
              id="workspace-panel-basic"
              title="모임 정보"
              eyebrow="기본 정보"
              expanded={basicOpen}
              variant="sheet"
              onToggle={closeSheet}
            >
              {basicPanel}
            </WorkspacePanel>
          ) : null}
          {historyPanel != null ? (
            <WorkspacePanel
              id="workspace-panel-history"
              title="변경 내역"
              eyebrow="작업 기록"
              expanded={historyOpen}
              variant="sheet"
              onToggle={closeSheet}
            >
              {historyPanel}
            </WorkspacePanel>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
