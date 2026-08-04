import type { AdminOperationCaseView } from "@/features/platform-admin/model/platform-admin-operations-model";

type Props = {
  items: readonly AdminOperationCaseView[];
  selectedCaseId: string | null;
  onSelectCase: (caseId: string) => void;
  hasNextPage?: boolean;
  loadingMore?: boolean;
  onLoadMore?: () => void;
};

export function AdminOperationsQueue({
  items,
  selectedCaseId,
  onSelectCase,
  hasNextPage = false,
  loadingMore = false,
  onLoadMore,
}: Props) {
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
              className="admin-operations-queue__row admin-operation-control--touch"
              data-severity={item.severity.toLowerCase()}
              data-scroll-marker={item.id === selectedCaseId ? "selected" : undefined}
              key={item.id}
              aria-pressed={item.id === selectedCaseId}
              aria-current={item.id === selectedCaseId ? "true" : undefined}
              onClick={() => onSelectCase(item.id)}
            >
              <span className="admin-operations-queue__headline">
                <strong className="admin-operation-wrap">{item.summary.title}</strong>
                <span className="admin-operations-queue__severity">{item.severityLabel}</span>
              </span>
              <span className="admin-operations-queue__context">
                <span>현재 상태 · {item.stateLabel}</span>
                <span>{item.sourceLabel}</span>
                <span>{item.impactLabel}</span>
                <span>{item.ageLabel}</span>
              </span>
            </button>
          ))}
          {hasNextPage && onLoadMore ? (
            <button
              type="button"
              className="btn btn-secondary admin-operations-queue__more admin-operation-control--touch"
              disabled={loadingMore}
              onClick={onLoadMore}
            >
              {loadingMore ? "다음 케이스를 불러오는 중" : "운영 케이스 더 보기"}
            </button>
          ) : null}
        </div>
      )}
    </section>
  );
}
