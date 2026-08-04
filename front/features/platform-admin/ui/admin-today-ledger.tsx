import type { ReactNode } from "react";
import type { AdminOperationsView } from "@/features/platform-admin/model/platform-admin-operations-model";
import { AdminOperationsInspector } from "./admin-operations-inspector";
import { AdminOperationsQueue } from "./admin-operations-queue";

export type AdminTodayFilters = {
  state: string;
  severity: string;
  source: string;
  assignee: string;
};

type HistoryEvent = {
  fromState: string | null;
  toState: string;
  action: string | null;
  reasonCode: string;
  occurredAt: string;
  caseVersion: number;
};

type Props = {
  view: AdminOperationsView;
  filters: AdminTodayFilters;
  history: readonly HistoryEvent[];
  lifecycleControls: ReactNode;
  detailLoading?: boolean;
  detailUnavailable?: boolean;
  refreshing?: boolean;
  onFilterChange: (key: keyof AdminTodayFilters, value: string) => void;
  onSelectCase: (caseId: string) => void;
};

export function AdminTodayLedger({
  view,
  filters,
  history,
  lifecycleControls,
  detailLoading = false,
  detailUnavailable = false,
  refreshing = false,
  onFilterChange,
  onSelectCase,
}: Props) {
  return (
    <section className="admin-today-ledger" aria-labelledby="admin-today-title">
      <header className="admin-today-ledger__header">
        <div>
          <h1 id="admin-today-title" className="h1 editorial">오늘의 운영 케이스</h1>
          <p className="admin-today-ledger__lede">
            감지된 운영 신호를 영향과 최신성에 따라 확인하고 상태를 기록합니다.
          </p>
        </div>
        <p className="admin-today-ledger__summary" aria-label="운영 케이스 요약">
          {view.mobileSummary.open} · {view.mobileSummary.critical} · {view.mobileSummary.assignedToMe}
        </p>
      </header>

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
          label="Source 필터"
          value={filters.source}
          onChange={(value) => onFilterChange("source", value)}
          options={[
            ["", "모든 source"],
            ["club_readiness", "클럽 준비"],
            ["notification", "알림"],
            ["ai_job", "AI 작업"],
            ["closing_risk", "회차 마감"],
          ]}
        />
        <label className="admin-today-ledger__assignee">
          <input
            type="checkbox"
            checked={filters.assignee === "me"}
            onChange={(event) => onFilterChange("assignee", event.target.checked ? "me" : "")}
          />
          내 담당만
        </label>
        {refreshing ? <span className="admin-today-ledger__refresh" role="status">새 신호 확인 중</span> : null}
      </div>

      <div className="admin-today-ledger__columns">
        <AdminOperationsQueue
          items={view.items}
          selectedCaseId={view.selectedCaseId}
          onSelectCase={onSelectCase}
        />
        <AdminOperationsInspector
          selectedCase={view.selectedCase}
          history={history}
          lifecycleControls={lifecycleControls}
          detailLoading={detailLoading}
          detailUnavailable={detailUnavailable}
        />
      </div>
    </section>
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
      <select aria-label={label} value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map(([optionValue, optionLabel]) => (
          <option value={optionValue} key={optionValue || "all"}>{optionLabel}</option>
        ))}
      </select>
    </label>
  );
}
