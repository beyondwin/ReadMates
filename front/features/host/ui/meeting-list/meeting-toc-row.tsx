import type { HostLinkComponent, HostLinkProps } from "@/features/host/ui/host-link-types";
import {
  defaultMeetingActionLabel,
  formatMeetingWeekday,
  type HostMeetingTocRow,
} from "@/features/host/model/host-meeting-list-model";

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

export function MeetingLedgerRow({
  row,
  LinkComponent = DefaultLink,
}: {
  row: HostMeetingTocRow;
  LinkComponent?: HostLinkComponent;
}) {
  return (
    <tr className="rm-meeting-toc__row">
      <td>
        <span className="rm-meeting-toc__no">{row.ordinalFolio}</span>
        <span aria-hidden> · </span>
        <LinkComponent to={row.href} state={row.state} className="rm-meeting-toc__title">
          {row.title}
        </LinkComponent>
      </td>
      <td>
        <time dateTime={row.date}>{meetingDateLabel(row)}</time>
        {row.dDayLabel ? <div className="rm-meeting-toc__dday">{row.dDayLabel}</div> : null}
      </td>
      <td>
        <span className="rm-meeting-toc__lifecycle">{row.lifecycleLabel}</span>
      </td>
      <td>
        <span className="rm-meeting-toc__summary">{row.summary}</span>
      </td>
      <td>
        <LinkComponent to={row.href} state={row.state} className="rm-meeting-toc__work">
          {meetingActionLabel(row)}
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
