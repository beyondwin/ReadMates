import type { ReactNode } from "react";

export type AdminWorkView = {
  id: string;
  label: string;
  count?: number | null;
};

export type AdminWorkViewBarProps = {
  views?: readonly AdminWorkView[];
  activeView?: string;
  onViewChange?: (id: string) => void;
  search?: {
    label: string;
    value: string;
    placeholder?: string;
    onChange: (value: string) => void;
  };
  filters?: ReactNode;
  pending?: {
    count: number;
    urgentCount: number;
    onApply: () => void;
  };
};

export function AdminWorkViewBar({
  views,
  activeView,
  onViewChange,
  search,
  filters,
  pending,
}: AdminWorkViewBarProps) {
  return (
    <div className="admin-work-view-bar" role="group" aria-label="작업 보기">
      {views && views.length > 0 ? (
        <div className="admin-work-view-bar__views">
          {views.map((view) => {
            const name = view.count == null ? view.label : `${view.label} ${view.count}`;
            return (
              <button
                key={view.id}
                type="button"
                className="admin-work-view-bar__view admin-work-view-bar__action"
                aria-pressed={view.id === activeView}
                onClick={() => onViewChange?.(view.id)}
              >
                {name}
              </button>
            );
          })}
        </div>
      ) : null}
      {search ? (
        <div className="admin-work-view-bar__search">
          <input
            type="search"
            value={search.value}
            placeholder={search.placeholder}
            aria-label={search.label}
            onChange={(event) => search.onChange(event.target.value)}
          />
        </div>
      ) : null}
      {filters ? <div className="admin-work-view-bar__filters">{filters}</div> : null}
      {pending ? (
        <div className="admin-work-view-bar__pending">
          <button
            type="button"
            className="admin-work-view-bar__action"
            onClick={pending.onApply}
          >
            {`새 항목 ${pending.count}개 적용`}
          </button>
          {pending.urgentCount > 0 ? (
            <p className="admin-work-view-bar__urgent">{`긴급 ${pending.urgentCount}건`}</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
