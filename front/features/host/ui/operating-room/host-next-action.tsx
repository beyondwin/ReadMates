import type { ComponentType, ReactNode } from "react";
import type { HostNextActionView } from "@/features/host/model/host-operating-room-model";
import { ReadmatesIcon } from "@/shared/ui/icon";
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

export type HostNextActionSecondary = {
  href: string;
  label: string;
};

export type HostNextActionProps = {
  action: HostNextActionView;
  pending?: boolean;
  onDefer?: (workItemKey: string) => void;
  LinkComponent?: ComponentType<NextActionLinkProps>;
  secondaryAction?: HostNextActionSecondary;
};

const stateLabels: Record<HostNextActionView["state"], string> = {
  actionable: "지금 처리",
  deferred: "보류됨 · 이어서 처리 가능",
  conflict: "최신 상태와 비교 필요",
  unknown: "처리 결과 확인 필요",
  none: "준비 확인 완료",
};

const DEFAULT_DEFER_LABEL = "내일 09:00까지 보류";

export function HostNextAction({
  action,
  pending = false,
  onDefer,
  LinkComponent = DefaultLink,
  secondaryAction,
}: HostNextActionProps) {
  const deferKey = action.state === "actionable" ? action.workItemKey : null;
  const canDefer = deferKey !== null && onDefer;
  const deferAction = canDefer && !pending ? () => onDefer(deferKey) : undefined;
  const actionName = action.ctaLabel ?? action.label;
  const primaryLabel = action.state === "deferred" ? `이어서 ${actionName}` : actionName;
  const primaryHref = action.state === "none" ? null : action.href;
  const deferLabel = action.deferLabel ?? DEFAULT_DEFER_LABEL;

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
            className="rm-operating-room-next-action__primary btn btn-primary"
            aria-label={primaryLabel}
          >
            {primaryLabel}
          </LinkComponent>
          {secondaryAction ? (
            <LinkComponent
              to={secondaryAction.href}
              className="rm-operating-room-next-action__secondary"
            >
              <ReadmatesIcon name="list" size={16} />
              {secondaryAction.label}
            </LinkComponent>
          ) : null}
          {canDefer ? (
            <button
              className="rm-operating-room-next-action__secondary"
              type="button"
              disabled={pending}
              onClick={deferAction}
            >
              <ReadmatesIcon name="clock" size={16} />
              {pending ? "보류 중" : deferLabel}
            </button>
          ) : null}
        </div>
      ) : null}

      {action.note ? (
        <p className="rm-operating-room-next-action__note">{action.note}</p>
      ) : null}
    </section>
  );
}
