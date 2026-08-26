import type { ComponentType, MouseEvent, ReactNode } from "react";
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
  onOpenTask,
}: {
  tasks: readonly HostMeetingTaskLink[];
  LinkComponent?: ComponentType<MeetingRelatedLinkProps>;
  onOpenTask?: (task: HostMeetingTaskLink) => void;
}) {
  const related = tasks.filter((item) => item.task !== "overview");
  if (related.length === 0) return null;

  return (
    <nav className="rm-focus-deck__related" aria-label="관련 작업">
      <h2 className="eyebrow">관련 작업</h2>
      <ul className="rm-focus-deck__related-list">
        {related.map((item) => (
          <li
            key={item.task}
            onClickCapture={onOpenTask ? (event: MouseEvent) => {
              if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey || event.button !== 0) {
                return;
              }
              event.preventDefault();
              event.stopPropagation();
              onOpenTask(item);
            } : undefined}
          >
            <LinkComponent to={item.href} className="rm-focus-deck__related-link">
              {item.label}
            </LinkComponent>
          </li>
        ))}
      </ul>
    </nav>
  );
}
