export type WorkspacePendingUndo = {
  description: string;
  onUndo: () => void;
  onOpenHistory: () => void;
  onDismiss: () => void;
};

export function WorkspaceUndoBar({
  pendingUndo,
}: {
  pendingUndo: WorkspacePendingUndo | null;
}) {
  if (!pendingUndo) {
    return null;
  }

  return (
    <div className="rm-workspace-undo-bar" role="status">
      <p className="small">{pendingUndo.description}</p>
      <div className="rm-workspace-undo-bar__actions">
        <button type="button" className="btn btn-quiet btn-sm" onClick={pendingUndo.onUndo}>
          되돌리기
        </button>
        <button type="button" className="btn btn-quiet btn-sm" onClick={pendingUndo.onOpenHistory}>
          변경 내역
        </button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={pendingUndo.onDismiss}>
          닫기
        </button>
      </div>
    </div>
  );
}
