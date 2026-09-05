import type { ComponentType, ReactNode } from "react";
import type { CurrentMeetingHeaderView } from "@/features/host/model/host-operating-room-model";
import type { ReadmatesIconName } from "@/shared/ui/icon";
import { ReadmatesIcon } from "@/shared/ui/icon";
import { BookCover } from "@/shared/ui/book-cover";
import { displayText, formatDateWithWeekday, formatKoreanTime } from "@/shared/ui/readmates-display";
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
  previewHref: string | null;
  memberViewHref?: string;
};

export type CurrentMeetingBadge =
  | { kind: "dday"; label: string }
  | { kind: "today"; label: "오늘" }
  | { kind: "live"; label: "진행 중" }
  | { kind: "closing"; label: string }
  | null;

type MeetingHeaderLinkProps = {
  to: string;
  className?: string;
  "aria-label"?: string;
  children: ReactNode;
};

export type CurrentMeetingHeaderProps = {
  meeting: CurrentMeetingHeaderMeeting;
  badge: CurrentMeetingBadge;
  links: CurrentMeetingHeaderLinks;
  LinkComponent?: ComponentType<MeetingHeaderLinkProps>;
};

const DefaultLink: ComponentType<MeetingHeaderLinkProps> = ({ to, children, ...props }) => (
  <a {...props} href={to}>{children}</a>
);

export function CurrentMeetingHeader({
  meeting,
  badge,
  links,
  LinkComponent = DefaultLink,
}: CurrentMeetingHeaderProps) {
  const bookTitle = displayText(meeting.bookTitle, "");
  const meetingTitle = displayText(meeting.title, "");
  const title = bookTitle || meetingTitle || "모임 제목 미정";
  const kicker = [
    bookTitle ? meetingTitle : "",
    displayText(meeting.bookAuthor, ""),
  ].filter(Boolean).join(" · ");
  const placeLabel = displayText(meeting.locationLabel, "장소 미정");
  const actions = [
    { label: "모임 정보", href: links.infoHref, icon: "info" as const },
    links.previewHref
      ? { label: "기록 미리보기", href: links.previewHref, icon: "document" as const }
      : { label: "일정 편집", href: links.scheduleHref, icon: "edit" as const },
    { label: "변경 이력", href: links.historyHref, icon: "history" as const },
  ] satisfies ReadonlyArray<{ label: string; href: string; icon: ReadmatesIconName }>;

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
          {badge ? (
            <span className="rm-operating-room-header__lifecycle" data-badge={badge.kind}>
              {badge.label}
            </span>
          ) : null}
        </div>
        {kicker ? <p className="rm-operating-room-header__kicker">{kicker}</p> : null}
      </div>

      <ul className="rm-operating-room-header__facts" aria-label="모임 일정과 장소">
        <li>
          <ReadmatesIcon name="calendar" size={16} />
          <time dateTime={meeting.date ?? undefined}>{formatDateWithWeekday(meeting.date, "날짜 미정")}</time>
        </li>
        <li>
          <ReadmatesIcon name="clock" size={16} />
          <span>{formatKoreanTime(meeting.startTime, "시간 미정")}</span>
        </li>
        <li>
          <ReadmatesIcon name="pin" size={16} />
          <span>{placeLabel}</span>
        </li>
      </ul>

      {links.memberViewHref ? (
        <LinkComponent
          to={links.memberViewHref}
          className="rm-operating-room-header__member-view"
          aria-label="멤버 시야"
        >
          <ReadmatesIcon name="eye" size={16} />
          멤버 시야
        </LinkComponent>
      ) : null}

      <nav className="rm-operating-room-header__actions" aria-label="현재 모임 작업">
        {actions.map((action) => (
          <LinkComponent
            key={action.label}
            to={action.href}
            className="rm-operating-room-header__action"
          >
            <ReadmatesIcon name={action.icon} size={16} />
            {action.label}
          </LinkComponent>
        ))}
      </nav>
    </header>
  );
}
