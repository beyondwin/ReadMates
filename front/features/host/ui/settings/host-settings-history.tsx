import { useState } from "react";
import type {
  HostSettingsHistoryItemView,
  HostSettingsHistoryPageView,
} from "@/features/host/model/host-settings-model";

const actionLabels: Record<HostSettingsHistoryItemView["action"], string> = {
  SETTINGS_UPDATED: "기본 설정 변경",
  CO_HOST_PROMOTED: "공동 호스트 지정",
  CO_HOST_DEMOTED: "공동 호스트 해제",
  CLUB_ENDED: "클럽 운영 종료",
};

const fieldLabels: Record<string, string> = {
  name: "클럽 이름",
  approvalPolicy: "가입 승인",
  defaultTimezone: "기본 시간대",
  scheduleReminderEnabled: "일정 알림",
  recordPublicationDefault: "기록 기본 공개 범위",
  status: "클럽 상태",
  role: "멤버 역할",
};

function allowedEntries(settings: Record<string, string | null>) {
  return Object.entries(settings).filter(([field]) => field in fieldLabels);
}

function appendUnique(
  current: HostSettingsHistoryItemView[],
  next: HostSettingsHistoryItemView[],
) {
  const seen = new Set(current.map((item) => item.historyId));
  return [...current, ...next.filter((item) => {
    if (seen.has(item.historyId)) return false;
    seen.add(item.historyId);
    return true;
  })];
}

export function HostSettingsHistory({
  page,
  onLoadMore,
}: {
  page: HostSettingsHistoryPageView;
  onLoadMore: (cursor: string) => Promise<HostSettingsHistoryPageView>;
}) {
  const [items, setItems] = useState(page.items);
  const [nextCursor, setNextCursor] = useState(page.nextCursor);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  async function loadMore() {
    if (!nextCursor || busy) return;
    const cursor = nextCursor;
    setBusy(true);
    setFailed(false);
    try {
      const next = await onLoadMore(cursor);
      setItems((current) => appendUnique(current, next.items));
      setNextCursor(next.nextCursor);
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="surface-quiet stack rm-host-editorial-ledger__panel" aria-labelledby="settings-history-title">
      <h2 id="settings-history-title">설정 변경 이력</h2>
      {items.length === 0 ? <p className="small muted">아직 기록된 설정 변경이 없습니다.</p> : (
        <ol className="stack">
          {items.map((item) => (
            <li key={item.historyId} className="surface stack">
              <div className="cluster">
                <strong>{actionLabels[item.action]}</strong>
                <span className="small muted">{new Date(item.occurredAt).toLocaleString("ko-KR")}</span>
              </div>
              {[...allowedEntries(item.beforeSettings), ...allowedEntries(item.afterSettings)].length > 0 ? (
                <dl>
                  {Object.keys(fieldLabels).flatMap((field) => {
                    const before = item.beforeSettings[field];
                    const after = item.afterSettings[field];
                    if (before === undefined && after === undefined) return [];
                    return [<div key={field}><dt>{fieldLabels[field]}</dt><dd>{before ?? "없음"} → {after ?? "없음"}</dd></div>];
                  })}
                </dl>
              ) : null}
            </li>
          ))}
        </ol>
      )}
      {failed ? <p role="alert">이력을 더 불러오지 못했습니다. 보이는 이력은 유지됩니다.</p> : null}
      {nextCursor ? (
        <button type="button" disabled={busy} onClick={() => { void loadMore(); }}>
          {busy ? "불러오는 중" : failed ? "설정 변경 이력 다시 시도" : "설정 변경 이력 더 보기"}
        </button>
      ) : null}
    </section>
  );
}
