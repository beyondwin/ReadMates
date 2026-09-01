import type { ReactNode } from "react";
import { ADMIN_COPY } from "@/features/platform-admin/model/admin-copy";
import { adminCaseLifecycleLanguage } from "@/features/platform-admin/model/admin-status-language";
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
  defaultOpen?: boolean;
  children?: ReactNode;
  onViewChange: (id: string) => void;
  onQueryChange: (value: string) => void;
  onFilterChange: (key: keyof AdminTodayFilters, value: string) => void;
  onApplyPending?: () => void;
};

export function AdminTodayControls({ defaultOpen = false, children, ...props }: AdminTodayControlsProps) {
  return (
    <details className="admin-today-controls" open={defaultOpen || undefined}>
      <summary>필터와 신호 상태</summary>
      <div className="admin-today-controls__body">
        <AdminWorkViewBar
          views={props.workViews}
          activeView={props.activeView}
          onViewChange={props.onViewChange}
          search={{
            label: ADMIN_COPY.search.loadedCases,
            value: props.query,
            placeholder: "제목 또는 신호",
            onChange: props.onQueryChange,
          }}
          filters={<AdminTodayFilterFields filters={props.filters} onFilterChange={props.onFilterChange} refreshing={props.refreshing} />}
          pending={(props.pendingCount ?? 0) > 0 && props.onApplyPending ? {
            count: props.pendingCount ?? 0,
            urgentCount: props.urgentCount ?? 0,
            onApply: props.onApplyPending,
          } : undefined}
        />
        {props.urgentAnnouncement ? (
          <p className="admin-today-urgent-notice" aria-live="polite">
            {props.urgentAnnouncement}
          </p>
        ) : null}
        {children}
      </div>
    </details>
  );
}

function AdminTodayFilterFields({
  filters,
  onFilterChange,
  refreshing = false,
}: {
  filters: AdminTodayFilters;
  onFilterChange: (key: keyof AdminTodayFilters, value: string) => void;
  refreshing?: boolean;
}) {
  return (
    <div className="admin-today-ledger__toolbar" aria-label="운영 케이스 필터">
      <FilterSelect
        label="상태 필터"
        value={filters.state}
        onChange={(value) => onFilterChange("state", value)}
        options={[
          ["", "모든 상태"],
          ["open", adminCaseLifecycleLanguage("OPEN").primaryText],
          ["acknowledged", adminCaseLifecycleLanguage("ACKNOWLEDGED").primaryText],
          ["snoozed", adminCaseLifecycleLanguage("SNOOZED").primaryText],
          ["resolved", adminCaseLifecycleLanguage("RESOLVED").primaryText],
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
