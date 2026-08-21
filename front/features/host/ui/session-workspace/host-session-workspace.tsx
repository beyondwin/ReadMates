import { useEffect, useRef, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from "react";
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
import { WorkspaceProgressList } from "./workspace-progress-list";
import { WorkspaceUndoBar, type WorkspacePendingUndo } from "./workspace-undo-bar";

const focusableSelector = [
  "button:not([disabled])",
  "a[href]",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "input:not([disabled])",
].join(", ");

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
  draftSaveLabel?: string | null;
  descriptionOverride?: string | null;
  focusContent?: ReactNode;
  relatedWork?: ReactNode;
  basicPanel: ReactNode;
  attendancePanel?: ReactNode;
  recordsPanel?: ReactNode;
  historyPanel: ReactNode;
  LinkComponent?: HostSessionEditorLinkComponent;
};

function focusLocation(): HostSessionWorkspaceLocation {
  return { panel: "focus", source: "manual" };
}

function panelLocation(panel: HostSessionWorkspacePanel, source: HostSessionWorkspaceLocation["source"] = "manual"): HostSessionWorkspaceLocation {
  return { panel, source };
}

function visibleFocusable(root: HTMLElement) {
  return Array.from(root.querySelectorAll<HTMLElement>(focusableSelector))
    .filter((element) => !element.closest("[hidden]"));
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
  draftSaveLabel = null,
  descriptionOverride = null,
  focusContent,
  relatedWork,
  basicPanel,
  attendancePanel,
  recordsPanel,
  historyPanel,
  LinkComponent = DefaultLinkComponent,
}: HostSessionWorkspaceProps) {
  const basicOpen = location.panel === "basic";
  const historyOpen = location.panel === "history";
  const attendanceOpen = location.panel === "attendance";
  const recordsOpen = location.panel === "records";
  const sheetOpen = basicOpen || historyOpen;
  const statusLabel = view.statusLabel;
  const sheetRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLElement | null>(null);

  const changePanel = (next: HostSessionWorkspaceLocation) => {
    const openingOverlay = (next.panel === "basic" || next.panel === "history") && !sheetOpen;
    if (openingOverlay && document.activeElement instanceof HTMLElement) {
      triggerRef.current = document.activeElement;
    }
    onLocationChange(next);
  };

  useEffect(() => {
    if (!sheetOpen) {
      return;
    }
    const first = sheetRef.current ? visibleFocusable(sheetRef.current)[0] : null;
    first?.focus();
  }, [sheetOpen, basicOpen, historyOpen]);

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
  const handleSheetKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      if (document.querySelectorAll('[role="dialog"][aria-modal="true"]').length > 1) {
        return;
      }
      event.preventDefault();
      closeSheet();
      return;
    }
    if (event.key !== "Tab" || !sheetRef.current) {
      return;
    }
    const focusable = visibleFocusable(sheetRef.current);
    if (focusable.length === 0) {
      event.preventDefault();
      return;
    }
    const first = focusable[0]!;
    const last = focusable[focusable.length - 1]!;
    const active = document.activeElement;
    if (event.shiftKey && (active === first || !sheetRef.current.contains(active))) {
      event.preventDefault();
      last.focus();
      return;
    }
    if (!event.shiftKey && (active === last || !sheetRef.current.contains(active))) {
      event.preventDefault();
      first.focus();
    }
  };
  const primaryLabel = view.primaryAction.label;
  const publishBlocked = view.primaryAction.kind === "PUBLISH_RECORD" && !view.publicationReady;
  const disabled = primaryActionDisabled || publishBlocked;
  const showPublicLink = Boolean(publicRecordHref) && view.primaryAction.kind === "VIEW_PUBLIC_RECORD";

  return (
    <div className="rm-host-session-workspace">
      <div className="rm-host-session-workspace__chrome" inert={sheetOpen || undefined}>
      <div className="rm-host-session-workspace__frame">
        <WorkspaceHeader
          header={header}
          statusLabel={statusLabel}
          basicOpen={basicOpen}
          historyOpen={historyOpen}
          onOpenBasic={() => changePanel(basicOpen ? focusLocation() : panelLocation("basic"))}
          onOpenHistory={() => changePanel(historyOpen ? focusLocation() : panelLocation("history"))}
          LinkComponent={LinkComponent}
        />

        <div className="rm-host-session-workspace__layout">
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
          </div>

          <aside className="rm-host-session-workspace__rail">
            <WorkspaceProgressList
              progress={view.progress}
              onSelect={(panel) => changePanel(panelLocation(panel, panel === "records" ? location.source : "manual"))}
            />
            {draftSaveLabel ? (
              <p className="small rm-host-session-workspace__save-state">{draftSaveLabel}</p>
            ) : null}
            {relatedWork}
          </aside>
        </div>

        <WorkspaceUndoBar pendingUndo={pendingUndo} />
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

      <div
        className="rm-host-session-workspace__sheet-backdrop"
        hidden={!sheetOpen}
        onMouseDown={(event) => {
          if (event.target === event.currentTarget) {
            closeSheet();
          }
        }}
      >
        <div
          ref={sheetRef}
          className="rm-host-session-workspace__sheet rm-host-session-workspace__sheet--bottom"
          role="dialog"
          aria-modal={sheetOpen}
          aria-labelledby={basicOpen ? "workspace-panel-basic-title" : "workspace-panel-history-title"}
          tabIndex={-1}
          onKeyDown={handleSheetKeyDown}
        >
          <div hidden={!basicOpen}>
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
          </div>
          <div hidden={!historyOpen}>
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
          </div>
        </div>
      </div>
    </div>
  );
}
