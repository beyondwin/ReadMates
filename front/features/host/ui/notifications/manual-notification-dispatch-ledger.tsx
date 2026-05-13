import { type CSSProperties } from "react";
import { formatDateOnlyLabel } from "@/shared/ui/readmates-display";
import type { ManualNotificationDispatchListItem } from "@/features/host/model/host-view-types";
import { eventLabels, eventOutboxStatusBadgeClass } from "./notification-formatters";
import { manualAudienceLabels, manualChannelLabels } from "./manual-notification-labels";

export function ManualNotificationDispatchLedger({
  dispatches,
  hasMore = false,
  loading = false,
  onLoadMore,
}: {
  dispatches: ManualNotificationDispatchListItem[];
  hasMore?: boolean;
  loading?: boolean;
  onLoadMore?: () => Promise<unknown>;
}) {
  return (
    <section className="surface" aria-labelledby="manual-dispatch-ledger-title" style={{ padding: 22, marginBottom: 20 }}>
      <div className="row-between" style={{ gap: 12, alignItems: "baseline", flexWrap: "wrap" }}>
        <h2 id="manual-dispatch-ledger-title" className="h3 editorial" style={{ margin: 0 }}>
          최근 수동 발송
        </h2>
      </div>
      {dispatches.length === 0 ? (
        <p className="small" style={{ color: "var(--text-2)", margin: "12px 0 0" }}>
          아직 수동 발송 기록이 없습니다.
        </p>
      ) : (
        <div className="stack" style={{ "--stack": "0px", marginTop: 10 } as CSSProperties}>
          {dispatches.map((dispatch, index) => (
            <article
              key={dispatch.manualDispatchId}
              className="row-between"
              style={{
                gap: 14,
                alignItems: "flex-start",
                padding: "14px 0",
                borderTop: index === 0 ? undefined : "1px solid var(--line-soft)",
                flexWrap: "wrap",
              }}
            >
              <div style={{ minWidth: 0 }}>
                <div className="row" style={{ gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                  <strong className="body" style={{ minWidth: 0 }}>
                    {eventLabels[dispatch.eventType]}
                  </strong>
                  <span className="badge badge-accent badge-dot">수동</span>
                  <span className={eventOutboxStatusBadgeClass(dispatch.eventStatus)}>{dispatch.eventStatus}</span>
                  {dispatch.resend ? <span className="badge badge-warn badge-dot">재발송</span> : null}
                </div>
                <div className="tiny" style={{ color: "var(--text-2)", marginTop: 6 }}>
                  <span>No.{String(dispatch.sessionNumber).padStart(2, "0")} · {dispatch.bookTitle}</span>
                  <span> · {manualChannelLabels[dispatch.requestedChannels]}</span>
                  <span> · {manualAudienceLabels[dispatch.audience]}</span>
                  <span> · {dispatch.targetCount}명</span>
                </div>
                <div className="tiny" style={{ color: "var(--text-3)", marginTop: 3 }}>
                  앱 {dispatch.expectedInAppCount} · 이메일 {dispatch.expectedEmailCount} · 요청 {dispatch.requestedBy} · {formatDateOnlyLabel(dispatch.createdAt)}
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
      {hasMore && onLoadMore ? (
        <button
          type="button"
          className="btn btn-quiet btn-sm"
          disabled={loading}
          style={{ marginTop: 12 }}
          onClick={() => void onLoadMore()}
        >
          {loading ? "불러오는 중" : "수동 발송 더 보기"}
        </button>
      ) : null}
    </section>
  );
}
