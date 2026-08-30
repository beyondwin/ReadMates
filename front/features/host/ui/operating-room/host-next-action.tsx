import type { ComponentType, ReactNode } from "react";
import type { HostNextActionView } from "@/features/host/model/host-operating-room-model";
import "./operating-room.css";

type NextActionLinkProps = {
  to: string;
  className?: string;
  "aria-label"?: string;
  children: ReactNode;
};

const DefaultLink: ComponentType<NextActionLinkProps> = ({ to, children, ...props }) => (
  <a {...props} href={to}>{children}</a>
);

export type HostNextActionProps = {
  action: HostNextActionView;
  onDefer?: (workItemKey: string) => void;
  LinkComponent?: ComponentType<NextActionLinkProps>;
};

const stateLabels: Record<HostNextActionView["state"], string> = {
  actionable: "지금 처리",
  deferred: "보류됨 · 이어서 처리 가능",
  conflict: "최신 상태와 비교 필요",
  unknown: "처리 결과 확인 필요",
  none: "준비 확인 완료",
};

export function HostNextAction({
  action,
  onDefer,
  LinkComponent = DefaultLink,
}: HostNextActionProps) {
  const deferKey = action.state === "actionable" ? action.workItemKey : null;
  const deferAction = deferKey !== null && onDefer
    ? () => onDefer(deferKey)
    : null;
  const primaryLabel = action.state === "deferred" ? `이어서 ${action.label}` : action.label;
  const primaryHref = action.state === "none" ? null : action.href;

  return (
    <section
      className="rm-operating-room-next-action"
      aria-labelledby="rm-operating-room-next-action-title"
      data-state={action.state}
    >
      <div className="rm-operating-room-next-action__heading-row">
        <h2 id="rm-operating-room-next-action-title">다음에 할 일</h2>
        <span className="rm-operating-room-next-action__state">{stateLabels[action.state]}</span>
      </div>

      <p className="rm-operating-room-next-action__label">{action.label}</p>
      <p className="rm-operating-room-next-action__reason">{action.reason}</p>

      {primaryHref ? (
        <div className="rm-operating-room-next-action__controls">
          <LinkComponent
            to={primaryHref}
            className="rm-operating-room-next-action__primary"
            aria-label={primaryLabel}
          >
            {primaryLabel}
          </LinkComponent>
          {deferAction ? (
            <button
              className="rm-operating-room-next-action__defer"
              type="button"
              onClick={deferAction}
            >
              내일 09:00까지 보류
            </button>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
