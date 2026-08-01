import type { HostNotificationSummary } from "@/features/host/model/host-view-types";
import type { HostDashboardAlertTone as HostAlertTone } from "@/features/host/model/host-dashboard-model";
import { nonNegativeCount } from "@/shared/ui/readmates-display";
import { Icon } from "./shared-sections";
import type { HostDashboardLinkComponent } from "./types";

const HOST_DASHBOARD_NOTIFICATIONS_LABEL = "알림 발송";

export function HostNotificationLedger({
  notifications,
  mobile = false,
  LinkComponent,
}: {
  notifications: HostNotificationSummary;
  mobile?: boolean;
  LinkComponent: HostDashboardLinkComponent;
}) {
  const failures = notifications.latestFailures.slice(0, 3);

  if (mobile) {
    const metrics = [
      { key: "pending", label: "대기", value: notifications.pending },
      { key: "failed", label: "실패", value: notifications.failed },
      { key: "dead", label: "중단", value: notifications.dead },
    ] as const;

    return (
      <section
        className="rm-host-mobile-notifications"
        aria-labelledby="host-mobile-notifications-title"
      >
        <header className="rm-host-mobile-notifications__header">
          <h2 id="host-mobile-notifications-title">{HOST_DASHBOARD_NOTIFICATIONS_LABEL}</h2>
          <span>최근 24시간 {nonNegativeCount(notifications.sentLast24h)}건</span>
        </header>
        <dl className="rm-host-mobile-notifications__metrics">
          {metrics.map(({ key, label, value }) => (
            <div key={key} data-status={key} data-active={value > 0 ? "true" : "false"}>
              <dt>{label}</dt>
              <dd className="ledger-number">{nonNegativeCount(value)}</dd>
            </div>
          ))}
        </dl>
        {failures.length > 0 ? (
          <ul className="rm-host-mobile-notifications__failures" aria-label="최근 실패 알림">
            {failures.map((failure) => (
              <li key={failure.id}>
                <span>
                  <strong className="mono">{failure.eventType}</strong>
                  <small>{maskEmail(failure.recipientEmail)}</small>
                </span>
                <small>
                  <span className="ledger-number">{nonNegativeCount(failure.attemptCount)}</span>회 시도
                </small>
              </li>
            ))}
          </ul>
        ) : null}
        <LinkComponent
          to="/app/host/notifications"
          className="rm-host-mobile-notifications__ledger-link"
        >
          <span>알림 발송 장부 열기</span>
          <span aria-hidden="true" className="rm-host-mobile-notifications__chevron">
            <Icon name="arrow-right" size={14} />
          </span>
        </LinkComponent>
      </section>
    );
  }

  return (
    <section
      className="rm-reading-desk"
      aria-labelledby="host-notifications-title"
      style={{ padding: "18px" }}
    >
      <div className="row-between" style={{ alignItems: "baseline", gap: 12, marginBottom: 12 }}>
        <h2 id="host-notifications-title" className="eyebrow" style={{ margin: 0 }}>
          {HOST_DASHBOARD_NOTIFICATIONS_LABEL}
        </h2>
        <span className="tiny" style={{ color: "var(--text-3)", whiteSpace: "nowrap" }}>
          최근 24시간 {nonNegativeCount(notifications.sentLast24h)}건
        </span>
      </div>
      <div>
        <div
          className="row"
          style={{
            gap: 8,
            flexWrap: "wrap",
            padding: "0 0 10px",
          }}
        >
          {[
            ["대기", notifications.pending],
            ["실패", notifications.failed],
            ["중단", notifications.dead],
          ].map(([label, value]) => (
            <span key={label} className={badgeClass(Number(value), label === "대기" ? "default" : "warn")}>
              {label} {nonNegativeCount(Number(value))}
            </span>
          ))}
        </div>
        <LinkComponent
          to="/app/host/notifications"
          className="btn btn-quiet btn-sm"
          style={{ marginTop: 12 }}
        >
          알림 발송 장부
        </LinkComponent>
        {failures.length > 0 ? (
          <ul style={{ margin: "4px 0 0", padding: 0, listStyle: "none" }}>
            {failures.map((failure, index) => (
              <li
                key={failure.id}
                className="row-between"
                style={{
                  gap: 10,
                  padding: "10px 0",
                  borderTop: index === 0 ? undefined : "1px solid var(--line-soft)",
                }}
              >
                <span style={{ minWidth: 0 }}>
                  <strong className="tiny mono" style={{ display: "block", color: "var(--text)" }}>
                    {failure.eventType}
                  </strong>
                  <span className="tiny" style={{ display: "block", marginTop: 2 }}>
                    {maskEmail(failure.recipientEmail)}
                  </span>
                </span>
                <span className="tiny" style={{ color: "var(--text-3)", whiteSpace: "nowrap" }}>
                  <span className="ledger-number">{nonNegativeCount(failure.attemptCount)}</span>회 시도
                </span>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </section>
  );
}

function maskEmail(email: string) {
  const [localPart, domain] = email.split("@");
  if (!localPart || !domain) {
    return "숨김";
  }

  return `${localPart[0]}***@${domain}`;
}

function badgeClass(value: number, tone: HostAlertTone) {
  if (value === 0 || tone === "ok") {
    return "badge badge-ok badge-dot";
  }

  if (tone === "warn") {
    return "badge badge-warn badge-dot";
  }

  if (tone === "accent") {
    return "badge badge-accent badge-dot";
  }

  return "badge badge-dot";
}
