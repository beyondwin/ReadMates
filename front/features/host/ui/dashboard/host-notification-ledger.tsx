import type { HostNotificationSummary } from "@/features/host/ui/host-ui-types";
import type { HostDashboardAlertTone as HostAlertTone } from "@/features/host/model/host-dashboard-model";
import { nonNegativeCount } from "@/shared/ui/readmates-display";
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
  const body = (
    <>
      <div className="row-between" style={{ alignItems: "baseline", gap: 12, marginBottom: mobile ? 10 : 12 }}>
        <h2 id={mobile ? undefined : "host-notifications-title"} className={mobile ? "body" : "eyebrow"} style={{ margin: 0 }}>
          {HOST_DASHBOARD_NOTIFICATIONS_LABEL}
        </h2>
        <span className="tiny" style={{ color: "var(--text-3)", whiteSpace: "nowrap" }}>
          최근 24시간 {nonNegativeCount(notifications.sentLast24h)}건
        </span>
      </div>
      <div className={mobile ? "m-list" : undefined}>
        <div
          className={mobile ? "m-list-row rm-host-dashboard-mobile__two-column-row" : "row"}
          style={{
            gap: mobile ? undefined : 8,
            flexWrap: "wrap",
            padding: mobile ? undefined : "0 0 10px",
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
          aria-label={mobile ? "알림 발송 장부 열기" : undefined}
        >
          알림 발송 장부
        </LinkComponent>
        {failures.length > 0 ? (
          <ul style={{ margin: mobile ? "10px 0 0" : "4px 0 0", padding: 0, listStyle: "none" }}>
            {failures.map((failure, index) => (
              <li
                key={failure.id}
                className={mobile ? "m-list-row rm-host-dashboard-mobile__two-column-row" : "row-between"}
                style={{
                  gap: 10,
                  padding: mobile ? undefined : "10px 0",
                  borderTop: index === 0 || mobile ? undefined : "1px solid var(--line-soft)",
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
                <span className="tiny mono" style={{ color: "var(--text-3)", whiteSpace: "nowrap" }}>
                  {nonNegativeCount(failure.attemptCount)}회 시도
                </span>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </>
  );

  return (
    <section
      className={mobile ? "m-card-quiet" : "rm-reading-desk"}
      aria-labelledby={mobile ? undefined : "host-notifications-title"}
      style={{ padding: mobile ? undefined : "18px" }}
    >
      {body}
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
