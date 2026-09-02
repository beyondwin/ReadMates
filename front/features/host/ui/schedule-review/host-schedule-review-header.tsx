import type { ComponentType, ReactNode } from "react";
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
      <LinkComponent to={returnHref} className="rm-schedule-review__return">운영실로 돌아가기</LinkComponent>
      <h1>일정 미열람 검토</h1>
      <p>{sessionNumber}회 · {bookTitle} · 일정 {scheduleRevision}판</p>
      {unreadMemberCount != null ? <p>미열람 {unreadMemberCount}명 · 미리보기 뒤에만 직접 보냅니다. 자동 발송하지 않아요.</p> : null}
    </header>
  );
}
