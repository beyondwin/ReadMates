import type { PlatformAdminWorkbenchView } from "@/features/platform-admin/model/platform-admin-workbench-model";
import { AdminSelectedBrief } from "@/features/platform-admin/ui/admin-selected-brief";
import { AdminWorkQueue } from "@/features/platform-admin/ui/admin-work-queue";

type Props = {
  workbench: PlatformAdminWorkbenchView;
  selectedItemId: string | null;
  filterLabel?: string | null;
  onClearFilter?: () => void;
  onSelectItem: (itemId: string) => void;
};

export function AdminTodayLedger({
  workbench,
  selectedItemId,
  filterLabel = null,
  onClearFilter,
  onSelectItem,
}: Props) {
  const activeItemId = workbench.selectedBrief?.item.id ?? selectedItemId;

  return (
    <section className="admin-today-ledger" aria-labelledby="admin-today-title">
      <header className="admin-today-ledger__header">
        <div>
          <p className="eyebrow">Platform operations</p>
          <h1 id="admin-today-title" className="h1 editorial">오늘 할 일</h1>
          <p className="admin-today-ledger__lede">
            공개 준비, 도메인 조치, 알림 실패, AI 작업 이상을 오늘 처리할 순서로 정리합니다.
          </p>
        </div>
        <div className="admin-today-ledger__metrics" aria-label="오늘 운영 요약">
          <span>조치 필요 {workbench.metrics.needsActionCount}</span>
          <span>공개 준비 {workbench.metrics.publishReadyCount}</span>
          <span>운영 경고 {workbench.metrics.operationsWarningCount}</span>
        </div>
      </header>

      {filterLabel ? (
        <p className="admin-today-ledger__filter">
          필터: {filterLabel}
          {onClearFilter ? (
            <button type="button" onClick={onClearFilter}>
              해제
            </button>
          ) : null}
        </p>
      ) : null}

      <div className="admin-today-ledger__columns">
        <AdminWorkQueue items={workbench.queueItems} selectedItemId={activeItemId} onSelectItem={onSelectItem} />
        <AdminSelectedBrief brief={workbench.selectedBrief} />
      </div>
    </section>
  );
}
