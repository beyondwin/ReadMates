import type { WorkbenchQueueItem } from "@/features/platform-admin/model/platform-admin-workbench-model";

type Props = {
  items: WorkbenchQueueItem[];
  selectedItemId: string | null;
  onSelectItem: (itemId: string) => void;
};

const severityLabel: Record<WorkbenchQueueItem["severity"], string> = {
  blocked: "막힘",
  critical: "긴급",
  attention: "확인",
  warn: "경고",
  ready: "준비",
  stable: "안정",
  info: "정보",
};

export function AdminWorkQueue({ items, selectedItemId, onSelectItem }: Props) {
  return (
    <section className="admin-work-queue" aria-label="운영 작업 큐">
      <div className="admin-work-queue__header">
        <p className="eyebrow">Operations ledger</p>
        <h2 className="h3 editorial">운영 작업 큐</h2>
      </div>
      {items.length === 0 ? (
        <p className="muted admin-work-queue__empty">오늘 처리할 플랫폼 작업이 없습니다.</p>
      ) : (
        <div className="admin-work-queue__list">
          {items.map((item) => (
            <button
              type="button"
              key={item.id}
              className="admin-work-queue__row"
              data-severity={item.severity}
              aria-pressed={item.id === selectedItemId}
              onClick={() => onSelectItem(item.id)}
            >
              <span className="admin-work-queue__main">
                <span className="admin-work-queue__title">
                  <strong>{item.name}</strong>
                  <span>{item.slug}</span>
                </span>
                <span className="admin-work-queue__reason">{item.reason}</span>
              </span>
              <span className="admin-work-queue__meta">
                <span className="admin-work-queue__severity">{severityLabel[item.severity]}</span>
                <span className="admin-work-queue__action">{item.primaryActionLabel}</span>
              </span>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
