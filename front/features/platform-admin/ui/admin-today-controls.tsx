import { ADMIN_COPY } from "@/features/platform-admin/model/admin-copy";
import type { AdminOperationWorkView } from "@/features/platform-admin/model/platform-admin-operations-model";
import { AdminWorkViewBar } from "./admin-work-view-bar";

export type AdminTodayFilters = {
  state: string;
  severity: string;
  source: string;
  assignee: string;
};

export type AdminTodayControlsProps = {
  workViews?: readonly AdminOperationWorkView[];
  activeView?: string;
  query: string;
  filters: AdminTodayFilters;
  pendingCount?: number;
  urgentCount?: number;
  refreshing?: boolean;
  urgentAnnouncement?: string | null;
  onViewChange: (id: string) => void;
  onQueryChange: (value: string) => void;
  onFilterChange: (key: keyof AdminTodayFilters, value: string) => void;
  onApplyPending?: () => void;
};

export function AdminTodayControls({
  workViews,
  activeView,
  query,
  filters,
  pendingCount = 0,
  urgentCount = 0,
  refreshing = false,
  urgentAnnouncement = null,
  onViewChange,
  onQueryChange,
  onFilterChange,
  onApplyPending,
}: AdminTodayControlsProps) {
  return (
    <div className="admin-today-controls">
      <AdminWorkViewBar
        views={workViews}
        activeView={activeView}
        onViewChange={onViewChange}
        search={{
          label: ADMIN_COPY.search.loadedCases,
          value: query,
          placeholder: "제목 또는 신호",
          onChange: onQueryChange,
        }}
        filters={
          <div className="admin-today-ledger__toolbar" aria-label="운영 케이스 필터">
            <FilterSelect
              label="상태 필터"
              value={filters.state}
              onChange={(value) => onFilterChange("state", value)}
              options={[
                ["", "모든 상태"],
                ["open", "미확인"],
                ["acknowledged", "확인됨"],
                ["snoozed", "보류됨"],
                ["resolved", "해결됨"],
              ]}
            />
            <FilterSelect
              label="심각도 필터"
              value={filters.severity}
              onChange={(value) => onFilterChange("severity", value)}
              options={[
                ["", "모든 심각도"],
                ["critical", "긴급"],
                ["warning", "경고"],
                ["ready", "준비"],
                ["info", "정보"],
              ]}
            />
            <FilterSelect
              label="관측 출처 필터"
              value={filters.source}
              onChange={(value) => onFilterChange("source", value)}
              options={[
                ["", "모든 출처"],
                ["club_readiness", "클럽 준비"],
                ["notification", "알림"],
                ["ai_job", "AI 작업"],
                ["closing_risk", "모임 마감"],
              ]}
            />
            <label className="admin-today-ledger__assignee admin-operation-control--touch">
              <input
                type="checkbox"
                checked={filters.assignee === "me"}
                onChange={(event) => onFilterChange("assignee", event.target.checked ? "me" : "")}
              />
              내 담당만
            </label>
            {refreshing ? <span className="admin-today-ledger__refresh" role="status">새 신호 확인 중</span> : null}
          </div>
        }
        pending={pendingCount > 0 && onApplyPending ? {
          count: pendingCount,
          urgentCount,
          onApply: onApplyPending,
        } : undefined}
      />
      {urgentAnnouncement ? (
        <p className="admin-today-urgent-notice" aria-live="polite">
          {urgentAnnouncement}
        </p>
      ) : null}
    </div>
  );
}

function FilterSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: ReadonlyArray<readonly [string, string]>;
  onChange: (value: string) => void;
}) {
  return (
    <label className="admin-today-ledger__filter">
      <span>{label}</span>
      <select
        className="admin-operation-control--touch"
        aria-label={label}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {options.map(([optionValue, optionLabel]) => (
          <option value={optionValue} key={optionValue || "all"}>{optionLabel}</option>
        ))}
      </select>
    </label>
  );
}
