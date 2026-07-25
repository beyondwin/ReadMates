import { type CSSProperties, type FormEvent } from "react";
import { formatDateOnlyLabel } from "@/shared/ui/readmates-display";
import { maskRecipient, type NotificationTestMailAuditItem } from "./notification-formatters";

export type NotificationTestMailToolProps = {
  value: string;
  audit: NotificationTestMailAuditItem[];
  disabled: boolean;
  pending: boolean;
  hasMore: boolean;
  loadingMore: boolean;
  onValueChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onLoadMore?: () => Promise<unknown>;
};

export function NotificationTestMailTool({
  value,
  audit,
  disabled,
  pending,
  hasMore,
  loadingMore,
  onValueChange,
  onSubmit,
  onLoadMore,
}: NotificationTestMailToolProps) {
  return (
    <section aria-labelledby="test-mail-title" className="surface rm-notification-test-mail" style={{ padding: 22 }}>
      <h3 id="test-mail-title" className="h3 editorial" style={{ margin: 0 }}>
        테스트 메일
      </h3>
      <form onSubmit={onSubmit} className="stack" style={{ "--stack": "12px", marginTop: 14 } as CSSProperties}>
        <div>
          <label className="label" htmlFor="notification-test-mail">
            테스트 메일 주소
          </label>
          <input
            id="notification-test-mail"
            className="input"
            type="email"
            value={value}
            disabled={disabled}
            onChange={(event) => onValueChange(event.currentTarget.value)}
            aria-label="테스트 메일 주소"
            autoComplete="email"
            required
          />
        </div>
        <button className="btn btn-primary btn-sm" type="submit" disabled={disabled}>
          {pending ? "발송 중" : "테스트 발송"}
        </button>
      </form>

      <div style={{ marginTop: 20 }}>
        <div className="eyebrow" style={{ marginBottom: 8 }}>
          테스트 발송 기록
        </div>
        {audit.length > 0 ? (
          <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {audit.map((row, index) => (
              <li
                key={row.id}
                className="row-between"
                style={{
                  gap: 10,
                  padding: "10px 0",
                  borderTop: index === 0 ? undefined : "1px solid var(--line-soft)",
                }}
              >
                <span style={{ minWidth: 0 }}>
                  <strong className="tiny mono" style={{ display: "block", color: "var(--text)" }}>
                    {maskRecipient(row.recipientEmail)}
                  </strong>
                  <span className="tiny" style={{ color: "var(--text-3)" }}>
                    {formatDateOnlyLabel(row.createdAt)}
                  </span>
                </span>
                <span className={row.status === "SENT" ? "badge badge-ok badge-dot" : "badge badge-warn badge-dot"}>
                  {row.status}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="small" style={{ color: "var(--text-2)", margin: 0 }}>
            테스트 발송 기록이 없습니다.
          </p>
        )}
        {hasMore && onLoadMore ? (
          <button
            type="button"
            className="btn btn-quiet btn-sm"
            disabled={loadingMore}
            style={{ marginTop: 12 }}
            onClick={() => void onLoadMore()}
          >
            {loadingMore ? "불러오는 중" : "더 보기"}
          </button>
        ) : null}
      </div>
    </section>
  );
}
