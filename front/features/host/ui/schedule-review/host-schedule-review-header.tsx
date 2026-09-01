import type { ComponentType, ReactNode } from "react";

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
  LinkComponent = DefaultLink,
}: {
  returnHref: string;
  sessionNumber: number;
  bookTitle: string;
  scheduleRevision: number;
  LinkComponent?: ComponentType<HostScheduleReviewLinkProps>;
}) {
  return (
    <header className="rm-schedule-review__header">
      <LinkComponent to={returnHref} className="rm-schedule-review__return">운영실로 돌아가기</LinkComponent>
      <h1>일정 미열람 검토</h1>
      <p>{sessionNumber}회 · {bookTitle} · 일정 {scheduleRevision}판</p>
    </header>
  );
}
