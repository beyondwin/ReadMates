import type { ComponentType, ReactNode } from "react";
import type { CurrentMeetingHeaderView } from "@/features/host/model/host-operating-room-model";
import { BookCover } from "@/shared/ui/book-cover";
import { displayText, formatDateOnlyLabel } from "@/shared/ui/readmates-display";
import "./operating-room.css";

export type CurrentMeetingHeaderMeeting = Omit<
  CurrentMeetingHeaderView,
  "title" | "bookTitle" | "bookAuthor" | "date" | "startTime" | "endTime" | "locationLabel"
> & {
  title: string | null;
  bookTitle: string | null;
  bookAuthor: string | null;
  date: string | null;
  startTime: string | null;
  endTime: string | null;
  locationLabel: string | null;
};

export type CurrentMeetingHeaderLinks = {
  infoHref: string;
  scheduleHref: string;
  historyHref: string;
  memberViewHref: string;
};

type MeetingHeaderLinkProps = {
  to: string;
  className?: string;
  children: ReactNode;
};

export type CurrentMeetingHeaderProps = {
  meeting: CurrentMeetingHeaderMeeting;
  dDayLabel: string | null;
  links: CurrentMeetingHeaderLinks;
  LinkComponent?: ComponentType<MeetingHeaderLinkProps>;
};

const DefaultLink: ComponentType<MeetingHeaderLinkProps> = ({ to, children, ...props }) => (
  <a {...props} href={to}>{children}</a>
);

function meetingTimeLabel(startTime: string | null, endTime: string | null): string {
  const start = startTime?.trim() ?? "";
  const end = endTime?.trim() ?? "";

  if (start && end) return `${start}–${end}`;
  return start || end || "시간 미정";
}

export function CurrentMeetingHeader({
  meeting,
  dDayLabel,
  links,
  LinkComponent = DefaultLink,
}: CurrentMeetingHeaderProps) {
  const title = displayText(meeting.title, "모임 제목 미정");
  const bookTitle = displayText(meeting.bookTitle, "도서 제목 미정");
  const bookAuthor = displayText(meeting.bookAuthor, "저자 미상");
  const dateLabel = formatDateOnlyLabel(meeting.date, "날짜 미정");
  const timeLabel = meetingTimeLabel(meeting.startTime, meeting.endTime);
  const placeLabel = displayText(meeting.locationLabel, "장소 미정");
  const normalizedDday = dDayLabel?.trim() || null;

  const actions = [
    { label: "모임 정보", href: links.infoHref },
    { label: "일정 편집", href: links.scheduleHref },
    { label: "변경 이력", href: links.historyHref },
    { label: "멤버 시야", href: links.memberViewHref },
  ] as const;

  return (
    <header
      className="rm-operating-room-header"
      role="group"
      aria-label="현재 모임"
      data-lifecycle={meeting.lifecycle}
    >
      <div className="rm-operating-room-header__cover">
        <BookCover
          title={meeting.bookTitle}
          author={meeting.bookAuthor}
          imageUrl={meeting.bookImageUrl}
          width="var(--rm-operating-room-cover-width)"
        />
      </div>

      <div className="rm-operating-room-header__identity">
        <div className="rm-operating-room-header__title-row">
          <h1 className="h1 editorial rm-operating-room-header__title">{title}</h1>
          {normalizedDday ? (
            <span className="rm-operating-room-header__dday mono">{normalizedDday}</span>
          ) : null}
          <span className="rm-operating-room-header__lifecycle">
            <span aria-hidden="true" className="rm-operating-room-header__lifecycle-mark" />
            {meeting.lifecycleLabel}
          </span>
        </div>
        <p className="rm-operating-room-header__book">
          {bookTitle} · {bookAuthor}
        </p>
      </div>

      <ul className="rm-operating-room-header__facts" aria-label="모임 일정과 장소">
        <li>
          <span className="rm-operating-room-header__fact-label">날짜</span>
          <time dateTime={meeting.date?.trim() || undefined}>{dateLabel}</time>
        </li>
        <li>
          <span className="rm-operating-room-header__fact-label">시간</span>
          <span className="mono">{timeLabel}</span>
        </li>
        <li>
          <span className="rm-operating-room-header__fact-label">장소</span>
          <span>{placeLabel}</span>
        </li>
      </ul>

      <nav className="rm-operating-room-header__actions" aria-label="현재 모임 작업">
        {actions.map((action) => (
          <LinkComponent
            key={action.label}
            to={action.href}
            className="rm-operating-room-header__action"
          >
            {action.label}
          </LinkComponent>
        ))}
      </nav>
    </header>
  );
}
