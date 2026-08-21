import type { HostSessionWorkspaceView } from "@/features/host/model/host-session-workspace-model";
import type { HostSessionEditorLinkComponent } from "@/features/host/ui/session-editor/session-editor-links";
import { DefaultLinkComponent } from "@/features/host/ui/session-editor/session-editor-links";

export type WorkspaceHeaderModel = {
  returnHref?: string | null;
  returnLabel?: string | null;
  sessionNumber: number | null;
  title: string;
  date?: string | null;
  time?: string | null;
  location?: string | null;
};

export function WorkspaceHeader({
  header,
  statusLabel,
  basicOpen,
  historyOpen,
  onOpenBasic,
  onOpenHistory,
  LinkComponent = DefaultLinkComponent,
}: {
  header: WorkspaceHeaderModel;
  statusLabel: HostSessionWorkspaceView["statusLabel"] | "새 모임";
  basicOpen: boolean;
  historyOpen: boolean;
  onOpenBasic: () => void;
  onOpenHistory: () => void;
  LinkComponent?: HostSessionEditorLinkComponent;
}) {
  const meta = [header.date, header.time, header.location].filter(Boolean).join(" · ");
  const numberLabel = header.sessionNumber === null
    ? null
    : `No.${header.sessionNumber}`;

  return (
    <header className="rm-host-session-workspace__header">
      {header.returnHref && header.returnLabel ? (
        <LinkComponent to={header.returnHref} className="btn btn-quiet btn-sm">
          {header.returnLabel}
        </LinkComponent>
      ) : null}
      <div className="rm-host-session-workspace__identity">
        {numberLabel ? <span className="rm-host-session-workspace__number">{numberLabel}</span> : null}
        <h1 className="h1 editorial rm-host-session-workspace__title">{header.title}</h1>
      </div>
      {meta ? (
        <p className="small rm-host-session-workspace__meta">{meta}</p>
      ) : null}
      <div className="rm-host-session-workspace__status-row">
        <span className="badge">{statusLabel}</span>
      </div>
      <div className="rm-host-session-workspace__secondary">
        <button
          type="button"
          className="btn btn-quiet btn-sm"
          aria-expanded={basicOpen}
          aria-controls="workspace-panel-basic"
          onClick={onOpenBasic}
        >
          모임 정보
        </button>
        <button
          type="button"
          className="btn btn-quiet btn-sm"
          aria-expanded={historyOpen}
          aria-controls="workspace-panel-history"
          onClick={onOpenHistory}
        >
          변경 내역
        </button>
      </div>
    </header>
  );
}
