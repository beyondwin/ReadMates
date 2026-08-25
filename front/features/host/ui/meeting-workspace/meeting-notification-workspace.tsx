import type { ReactNode } from "react";

export function MeetingNotificationWorkspace({ children }: { children: ReactNode }) {
  return (
    <section className="rm-meeting-notification-workspace" aria-labelledby="meeting-notification-title">
      <header>
        <h2 id="meeting-notification-title" className="h2 editorial">이 모임 알림</h2>
        <p className="small muted">대상과 내용을 미리 확인한 뒤 별도로 보냅니다. 모임 작업만으로 알림이 자동 발송되지는 않습니다.</p>
      </header>
      {children}
    </section>
  );
}
