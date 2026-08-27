import type { ComponentType, ReactNode } from "react";
import type { HostMeetingDiaryView } from "@/features/host/model/host-meeting-diary-model";

export type MeetingDiaryLinkProps = {
  to: string;
  className?: string;
  children: ReactNode;
};

const defaultLink = ({ to, children, ...props }: MeetingDiaryLinkProps) => (
  <a href={to} {...props}>{children}</a>
);

const STATE_LABEL: Record<"done" | "current" | "upcoming", string | null> = {
  done: "완료",
  current: "지금",
  upcoming: null,
};

export function MeetingDiaryTimeline({
  diary,
  LinkComponent = defaultLink,
}: {
  diary: HostMeetingDiaryView;
  LinkComponent?: ComponentType<MeetingDiaryLinkProps>;
}) {
  return (
    <nav className="rm-meeting-diary__timeline" aria-label="모임의 걸음">
      <h2 className="eyebrow">모임의 걸음</h2>
      <ol className="rm-meeting-diary__steps">
        {diary.steps.map((step) => {
          const stateLabel = STATE_LABEL[step.state];
          const body = (
            <>
              <span className="rm-meeting-diary__step-label">{step.label}</span>
              {stateLabel ? (
                <span className="rm-meeting-diary__step-state">{stateLabel}</span>
              ) : null}
              {step.detail ? (
                <span className="rm-meeting-diary__step-detail">{step.detail}</span>
              ) : null}
            </>
          );
          return (
            <li
              key={step.id}
              className={`rm-meeting-diary__step is-${step.state}`}
              aria-current={step.state === "current" ? "step" : undefined}
            >
              {step.href ? (
                <LinkComponent to={step.href} className="rm-meeting-diary__step-link">
                  {body}
                </LinkComponent>
              ) : (
                <div className="rm-meeting-diary__step-link">{body}</div>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
