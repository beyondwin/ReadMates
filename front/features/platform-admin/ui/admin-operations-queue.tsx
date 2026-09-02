import type { ReactNode } from "react";
import type { AdminOperationCaseView } from "@/features/platform-admin/model/platform-admin-operations-model";

type Props = {
  items: readonly AdminOperationCaseView[];
  selectedCaseId: string | null;
  onSelectCase: (caseId: string) => void;
  hasNextPage?: boolean;
  loadingMore?: boolean;
  onLoadMore?: () => void;
  secondaryControls?: ReactNode;
};

export function AdminOperationsQueue({
  items,
  selectedCaseId,
  onSelectCase,
  hasNextPage = false,
  loadingMore = false,
  onLoadMore,
  secondaryControls,
}: Props) {
  return (
    <section className="admin-operations-queue" aria-label="운영 케이스 큐">
      <div className="admin-operations-queue__header">
        <h2 className="h3">오늘 할 일</h2>
        <span className="admin-operations-queue__sort">최신순</span>
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
              onClick={() => onSelectCase(item.id)}
            >
              <span className="admin-operations-queue__headline">
                <span className="admin-operations-queue__badge" aria-hidden="true">!</span>
                {item.locatorLabel ? (
                  <span className="admin-operations-queue__locator">{item.locatorLabel}</span>
                ) : null}
                <strong className="admin-operation-wrap">{item.summary.title}</strong>
                <span className="admin-operations-queue__severity">{item.severityLabel}</span>
                <span className="admin-operations-queue__age">{item.ageLabel}</span>
              </span>
              <span className="admin-operations-queue__context">
                {item.scopeLabel ? <span className="admin-operations-queue__scope admin-operation-wrap">{item.scopeLabel}</span> : null}
                {item.mobileMetaLabel ? (
                  <span className="admin-operations-queue__mobile-meta admin-operation-wrap">{item.mobileMetaLabel}</span>
                ) : null}
                <span>현재 상태 · {item.stateLabel}</span>
                <span>{item.sourceLabel}</span>
                <span>{item.impactLabel}</span>
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

      {secondaryControls ? <div className="admin-operations-queue__controls">{secondaryControls}</div> : null}
    </section>
  );
}
