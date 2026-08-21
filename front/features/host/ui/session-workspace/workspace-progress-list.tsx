import type { HostSessionWorkspacePanel, HostSessionWorkspaceView } from "@/features/host/model/host-session-workspace-model";

const PROGRESS_STATE_LABEL: Record<HostSessionWorkspaceView["progress"][number]["state"], string> = {
  done: "완료",
  current: "진행 중",
  next: "대기",
};

function panelForProgressId(id: string): HostSessionWorkspacePanel {
  if (id === "basic") return "basic";
  if (id === "attendance") return "attendance";
  if (id === "records" || id === "publish") return "records";
  return "focus";
}

export function WorkspaceProgressList({
  progress,
  onSelect,
}: {
  progress: HostSessionWorkspaceView["progress"];
  onSelect: (panel: HostSessionWorkspacePanel) => void;
}) {
  return (
    <section className="rm-host-session-workspace__progress" aria-labelledby="workspace-progress-title">
      <h2 id="workspace-progress-title" className="eyebrow">진행 상황</h2>
      <ol className="rm-host-session-workspace__progress-list" aria-label="진행 상황">
        {progress.map((item) => (
          <li
            key={item.id}
            className={`rm-host-session-workspace__progress-item is-${item.state}`}
            aria-current={item.state === "current" ? "step" : undefined}
            aria-label={`${item.label} ${PROGRESS_STATE_LABEL[item.state]}`}
          >
            <button
              type="button"
              className="rm-host-session-workspace__progress-button"
              onClick={() => onSelect(panelForProgressId(item.id))}
            >
              <span>{item.label}</span>
              <span className="tiny">{PROGRESS_STATE_LABEL[item.state]}</span>
            </button>
          </li>
        ))}
      </ol>
    </section>
  );
}
