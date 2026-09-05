import type { HostLinkComponent, HostLinkProps } from "@/features/host/ui/host-link-types";
import {
  defaultMeetingActionLabel,
  formatMeetingDDay,
  formatMeetingWeekday,
  type HostMeetingTocRow,
} from "@/features/host/model/host-meeting-list-model";
import { ReadmatesIcon } from "@/shared/ui/icon";

function DefaultLink({ to, children, state: _state, ...props }: HostLinkProps) {
  void _state;
  return (
    <a {...props} href={to}>
      {children}
    </a>
  );
}

function meetingDateLabel(row: HostMeetingTocRow) {
  return row.dateLabel ?? formatMeetingWeekday(row.date);
}

function meetingActionLabel(row: HostMeetingTocRow) {
  return row.actionLabel ?? defaultMeetingActionLabel(row.lifecycleLabel);
}

function meetingStatusTone(label: string): "warn" | "ok" | "info" | undefined {
  if (label === "마감 필요" || label === "기록 정리 중") return "warn";
  if (label === "게시됨") return "ok";
  if (label === "준비 중") return "info";
  return undefined;
}

function SummaryText({ summary }: { summary: string }) {
  const parts = summary.split(/(\d+\/\d+)/);
  return (
    <span className="rm-meeting-toc__summary">
      {parts.map((part, index) => (
        /^\d+\/\d+$/.test(part)
          ? <span key={`${part}-${index}`} className="rm-meeting-toc__summary-count">{part}</span>
          : <span key={`${part}-${index}`}>{part}</span>
      ))}
    </span>
  );
}

export function MeetingLedgerRow({
  row,
  current = false,
  now,
  LinkComponent = DefaultLink,
}: {
  row: HostMeetingTocRow;
  current?: boolean;
  now?: Date;
  LinkComponent?: HostLinkComponent;
}) {
  const tone = meetingStatusTone(row.lifecycleLabel);
  const dDay = row.dDayLabel ?? (now ? formatMeetingDDay(row.date, now) : undefined);
  return (
    <tr className="rm-meeting-toc__row" data-current={current || row.current ? "true" : undefined}>
      <td>
        <span className="rm-meeting-toc__no">{row.ordinalFolio}</span>
        <span aria-hidden> · </span>
        <LinkComponent to={row.href} state={row.state} className="rm-meeting-toc__title">
          {row.title}
        </LinkComponent>
      </td>
      <td>
        <time dateTime={row.date}>{meetingDateLabel(row)}</time>
        {dDay ? <div className="rm-meeting-toc__dday">{dDay}</div> : null}
      </td>
      <td>
        <span className="rm-meeting-toc__lifecycle">
          <span className="rm-meeting-toc__status-dot" data-tone={tone} />
          {row.lifecycleLabel}
        </span>
      </td>
      <td>
        <SummaryText summary={row.summary} />
      </td>
      <td>
        <LinkComponent to={row.href} state={row.state} className="rm-meeting-toc__work">
          {meetingActionLabel(row)}
          <ReadmatesIcon name="chevron-right" size={16} />
        </LinkComponent>
      </td>
    </tr>
  );
}

export function MeetingTocRow({
  row,
  LinkComponent = DefaultLink,
}: {
  row: HostMeetingTocRow;
  LinkComponent?: HostLinkComponent;
}) {
  return (
    <li className="rm-meeting-toc__calendar-row">
      <LinkComponent to={row.href} state={row.state} className="rm-meeting-toc__title">
        {row.title}
      </LinkComponent>
    </li>
  );
}
