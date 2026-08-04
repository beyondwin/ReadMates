import type { AdminOperationCaseView } from "@/features/platform-admin/model/platform-admin-operations-model";

type Props = {
  items: readonly AdminOperationCaseView[];
  selectedCaseId: string | null;
  onSelectCase: (caseId: string) => void;
};

export function AdminOperationsQueue({ items, selectedCaseId, onSelectCase }: Props) {
  return (
    <section className="admin-operations-queue" aria-label="운영 케이스 큐">
      <div className="admin-operations-queue__header">
        <h2 className="h3">운영 케이스</h2>
        <span>{items.length}건</span>
      </div>

      {items.length === 0 ? (
        <p className="admin-operations-queue__empty">현재 조건에 맞는 운영 케이스가 없습니다.</p>
      ) : (
        <div className="admin-operations-queue__list">
          {items.map((item) => (
            <button
              type="button"
              className="admin-operations-queue__row"
              data-severity={item.severity.toLowerCase()}
              key={item.id}
              aria-pressed={item.id === selectedCaseId}
              onClick={() => onSelectCase(item.id)}
            >
              <span className="admin-operations-queue__headline">
                <strong>{item.summary.title}</strong>
                <span className="admin-operations-queue__severity">{item.severityLabel}</span>
              </span>
              <span className="admin-operations-queue__context">
                <span>{item.sourceLabel}</span>
                <span>{item.impactLabel}</span>
                <span>{item.ageLabel}</span>
              </span>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
