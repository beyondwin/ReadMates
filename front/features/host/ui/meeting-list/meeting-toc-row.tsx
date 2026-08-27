import type { HostLinkComponent, HostLinkProps } from "@/features/host/ui/host-link-types";
import type { HostMeetingTocRow } from "@/features/host/model/host-meeting-list-model";

function DefaultLink({ to, children, state: _state, ...props }: HostLinkProps) {
  void _state;
  return (
    <a {...props} href={to}>
      {children}
    </a>
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
    <li className="rm-meeting-toc__row">
      <span className="rm-meeting-toc__no mono">{row.ordinalFolio}</span>
      <LinkComponent to={row.href} className="rm-meeting-toc__title">
        {row.title}
      </LinkComponent>
      {row.attentionLabel ? (
        <span className="rm-meeting-toc__attention">{row.attentionLabel}</span>
      ) : null}
      <span className="rm-meeting-toc__lifecycle">{row.lifecycleLabel}</span>
      <span className="rm-meeting-toc__leader" aria-hidden />
      <span className="rm-meeting-toc__summary mono">{row.summary}</span>
    </li>
  );
}
