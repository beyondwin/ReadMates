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
  leading?: ReactNode;
  recovery?: ReactNode;
  panel?: ReactNode;
  basicPanel?: ReactNode;
  attendancePanel?: ReactNode;
  recordsPanel?: ReactNode;
  historyPanel?: ReactNode;
  notificationsPanel?: ReactNode;
  chrome?: boolean;
  LinkComponent?: HostSessionEditorLinkComponent;
};

const overlayCopy: Record<Exclude<HostSessionWorkspacePanel, "focus">, { id: string; title: string; eyebrow?: string }> = {
  basic: { id: "workspace-panel-basic", title: "모임 정보", eyebrow: "기본 정보" },
  responses: { id: "workspace-panel-responses", title: "참석 응답" },
  attendance: { id: "workspace-panel-attendance", title: "출석", eyebrow: "참석 명단" },
  records: { id: "workspace-panel-records", title: "모임 기록", eyebrow: "모임 기록" },
  notifications: { id: "workspace-panel-notifications", title: "알림" },
  history: { id: "workspace-panel-history", title: "변경 내역", eyebrow: "작업 기록" },
};

function focusLocation(): HostSessionWorkspaceLocation {
  return { panel: "focus", source: "manual" };
}

function panelLocation(panel: HostSessionWorkspacePanel, source: HostSessionWorkspaceLocation["source"] = "manual"): HostSessionWorkspaceLocation {
  return { panel, source };
}

function namedOverlayBody(
  panel: Exclude<HostSessionWorkspacePanel, "focus">,
  bodies: {
    basicPanel: ReactNode;
    attendancePanel: ReactNode;
    recordsPanel: ReactNode;
    historyPanel: ReactNode;
    notificationsPanel: ReactNode;
  },
) {
  if (panel === "basic") return bodies.basicPanel;
  if (panel === "history") return bodies.historyPanel;
  if (panel === "attendance") return bodies.attendancePanel;
  if (panel === "records") return bodies.recordsPanel;
  if (panel === "notifications") return bodies.notificationsPanel;
  return null;
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
  leading = null,
  recovery,
  panel,
  basicPanel = null,
  attendancePanel,
  recordsPanel,
  historyPanel = null,
  notificationsPanel = null,
  chrome = true,
  LinkComponent = DefaultLinkComponent,
}: HostSessionWorkspaceProps) {
  const overlayPanel = location.panel === "focus" ? null : location.panel;
  const overlayMeta = overlayPanel ? overlayCopy[overlayPanel] : null;
  const overlayBody = overlayPanel == null
    ? null
    : panel ?? namedOverlayBody(overlayPanel, {
      basicPanel,
      attendancePanel,
      recordsPanel,
      historyPanel,
      notificationsPanel,
    });
  const deckOwned = panel != null;
  const sheetPanel = overlayPanel === "basic" || overlayPanel === "history"
    || (deckOwned && overlayPanel != null);
  const sheetOpen = Boolean(chrome && sheetPanel && overlayMeta && overlayBody != null);
  const chromeInert = sheetOpen && deckOwned;
  const basicOpen = location.panel === "basic";
  const historyOpen = location.panel === "history";
  const attendanceOpen = location.panel === "attendance";
  const recordsOpen = location.panel === "records";
  const triggerRef = useRef<HTMLElement | null>(null);

  const changePanel = (next: HostSessionWorkspaceLocation) => {
    const openingOverlay = next.panel !== "focus" && !sheetOpen;
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
  const undoBar = (
    <WorkspaceUndoBar
      pendingUndo={pendingUndo}
      confirm={undoConfirm}
      restoreNotice={restoreNotice}
    />
  );

  if (!chrome) {
    return (
      <div className="rm-host-session-workspace-surface">
        {focusContent}
        {recovery}
        {undoBar}
        {overlayBody}
      </div>
    );
  }

  return (
    <div className="rm-host-session-workspace">
      <div className="rm-host-session-workspace__chrome" inert={chromeInert || undefined}>
      <div className="rm-host-session-workspace__frame">
        <WorkspaceHeader
          header={header}
          statusLabel={view.statusLabel}
          basicOpen={basicOpen}
          historyOpen={historyOpen}
          onOpenBasic={() => changePanel(basicOpen ? focusLocation() : panelLocation("basic"))}
          onOpenHistory={() => changePanel(historyOpen ? focusLocation() : panelLocation("history"))}
          LinkComponent={LinkComponent}
        />

        <div className={`rm-host-session-workspace__layout${leading ? " is-spread" : ""}`}>
          {leading ? (
            <div className="rm-host-session-workspace__leading">
              {leading}
            </div>
          ) : null}
          <div className="rm-host-session-workspace__main">
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

            {facts}

            {relatedWork}

            {draftSaveLabel ? (
              <p className="small rm-host-session-workspace__save-state">{draftSaveLabel}</p>
            ) : null}

            {recovery}

            {undoBar}

            {location.panel === "focus" ? panel : null}

            {!deckOwned && attendancePanel ? (
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

            {!deckOwned && recordsPanel ? (
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
          </div>
        </div>
      </div>

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
      </div>

      {deckOwned && sheetOpen && overlayMeta ? (
        <WorkspacePanel
          id={overlayMeta.id}
          title={overlayMeta.title}
          eyebrow={overlayMeta.eyebrow}
          expanded
          variant="sheet"
          onToggle={closeSheet}
        >
          {overlayBody}
        </WorkspacePanel>
      ) : null}

      {!deckOwned && basicPanel != null ? (
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

      {!deckOwned && historyPanel != null ? (
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
    </div>
  );
}
