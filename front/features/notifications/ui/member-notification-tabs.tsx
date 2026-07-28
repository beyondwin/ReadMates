export function MemberNotificationTabs({
  active,
  basePath,
}: {
  active: "inbox" | "settings";
  basePath: string;
}) {
  return (
    <nav className="rm-member-notification-tabs" aria-label="알림 보기">
      <a
        className="rm-member-notification-tabs__link"
        href={`${basePath}/notifications`}
        aria-current={active === "inbox" ? "page" : undefined}
      >
        받은 알림
      </a>
      <a
        className="rm-member-notification-tabs__link"
        href={`${basePath}/notifications/settings`}
        aria-current={active === "settings" ? "page" : undefined}
      >
        수신 설정
      </a>
    </nav>
  );
}
