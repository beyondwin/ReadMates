import type { ClubShellLinkComponent } from "@/shared/model/app-club-shell";
import "./host-shell.css";

export type HostUtilityActionId = "settings" | "member-view" | "notifications" | "new-meeting";

export type UtilityLimit = {
  id: HostUtilityActionId;
  reason: string;
};

export type HostUtilityActionsProps = {
  settingsHref: string;
  memberViewHref: string;
  notificationsHref: string;
  newMeetingHref: string;
  unreadNotifications: number;
  permissionLimits: readonly UtilityLimit[];
  LinkComponent?: ClubShellLinkComponent;
};

const DefaultLink: ClubShellLinkComponent = ({ to, children, ...props }) => (
  <a {...props} href={to}>{children}</a>
);

export function HostUtilityActions({
  settingsHref,
  memberViewHref,
  notificationsHref,
  newMeetingHref,
  unreadNotifications,
  permissionLimits,
  LinkComponent = DefaultLink,
}: HostUtilityActionsProps) {
  const unreadCount = Math.max(0, Math.trunc(unreadNotifications));
  const limitations = new Map(permissionLimits.map((limit) => [limit.id, limit.reason]));
  const actions = [
    { id: "settings" as const, label: "초대와 설정", href: settingsHref },
    { id: "member-view" as const, label: "멤버 시야", href: memberViewHref },
    { id: "notifications" as const, label: "알림", href: notificationsHref },
    { id: "new-meeting" as const, label: "새 모임", href: newMeetingHref },
  ];

  return (
    <nav className="rm-host-utility-actions" aria-label="호스트 유틸리티">
      <ul>
        {actions.map((action) => {
          const disabledReason = limitations.get(action.id);
          const reasonId = `host-utility-${action.id}-reason`;
          const notificationLabel = action.id === "notifications" && unreadCount > 0
            ? `${action.label}, 읽지 않은 알림 ${unreadCount}개`
            : action.label;
          const className = [
            "rm-host-utility-actions__item",
            action.id === "new-meeting" ? "is-create" : "",
            disabledReason ? "is-disabled" : "",
          ].filter(Boolean).join(" ");

          return (
            <li key={action.id}>
              {disabledReason ? (
                <>
                  <span
                    className={className}
                    aria-disabled="true"
                    aria-describedby={reasonId}
                  >
                    {action.label}
                  </span>
                  <span id={reasonId} className="rm-host-utility-actions__reason">
                    {disabledReason}
                  </span>
                </>
              ) : (
                <LinkComponent
                  to={action.href}
                  className={className}
                  aria-label={notificationLabel}
                >
                  <span>{action.label}</span>
                  {action.id === "notifications" && unreadCount > 0 ? (
                    <span className="rm-host-utility-actions__count" aria-hidden="true">
                      {unreadCount}
                    </span>
                  ) : null}
                </LinkComponent>
              )}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
