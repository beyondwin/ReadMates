import type { ComponentType, ReactNode } from "react";
import { ReadmatesIcon } from "@/shared/ui/icon";
import "./host-schedule-review.css";

export type HostScheduleReviewLinkProps = {
  to: string;
  className?: string;
  children: ReactNode;
};

const DefaultLink: ComponentType<HostScheduleReviewLinkProps> = ({ to, children, ...props }) => (
  <a {...props} href={to}>{children}</a>
);

export function HostScheduleReviewHeader({
  returnHref,
  sessionNumber,
  bookTitle,
  scheduleRevision,
  unreadMemberCount,
  LinkComponent = DefaultLink,
}: {
  returnHref: string;
  sessionNumber: number;
  bookTitle: string;
  scheduleRevision: number;
  unreadMemberCount?: number;
  LinkComponent?: ComponentType<HostScheduleReviewLinkProps>;
}) {
  return (
    <header className="rm-schedule-review__header">
      <nav className="rm-schedule-review__breadcrumb" aria-label="경로">
        <LinkComponent to={returnHref}>운영실</LinkComponent>
        <span aria-hidden="true"> / </span>
        <span>일정 미열람 확인</span>
      </nav>
      <h1>일정 미열람 안내</h1>
      <p>
        {sessionNumber}회 · {bookTitle} · 일정 {scheduleRevision}판
        {unreadMemberCount != null ? ` · 미열람 ${unreadMemberCount}명` : ""}
      </p>
      <p className="rm-schedule-review__revision">
        <ReadmatesIcon name="clock" size={16} />
        현재 일정 revision {scheduleRevision}
      </p>
    </header>
  );
}
