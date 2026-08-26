import type { ComponentType, ReactNode } from "react";
import type { HostMeetingTaskLink } from "@/features/host/model/host-session-workspace-model";

export type MeetingRelatedLinkProps = {
  to: string;
  className?: string;
  children: ReactNode;
};

const defaultLink = ({ to, children, ...props }: MeetingRelatedLinkProps) => (
  <a href={to} {...props}>{children}</a>
);

export function MeetingRelatedWork({
  tasks,
  LinkComponent = defaultLink,
}: {
  tasks: readonly HostMeetingTaskLink[];
  LinkComponent?: ComponentType<MeetingRelatedLinkProps>;
}) {
  const related = tasks.filter((item) => item.task !== "overview");
  if (related.length === 0) return null;

  return (
    <nav className="rm-focus-deck__related" aria-label="관련 작업">
      <h2 className="eyebrow">관련 작업</h2>
      <ul className="rm-focus-deck__related-list">
        {related.map((item) => (
          <li key={item.task}>
            <LinkComponent to={item.href} className="rm-focus-deck__related-link">
              {item.label}
            </LinkComponent>
          </li>
        ))}
      </ul>
    </nav>
  );
}
