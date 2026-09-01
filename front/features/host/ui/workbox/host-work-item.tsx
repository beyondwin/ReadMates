import { useState, type ComponentType, type ReactNode } from "react";
import type { HostWorkboxItemView } from "@/features/host/model/host-workbox-model";
import { OperationReceipt, operationReceiptOutcome } from "./operation-receipt";

export type HostWorkboxDeferralOption = "TOMORROW" | "THREE_DAYS" | "NEXT_WEEK";

type WorkItemLinkProps = {
  to: string;
  className?: string;
  children: ReactNode;
};

const DefaultLink: ComponentType<WorkItemLinkProps> = ({ to, children, ...props }) => (
  <a {...props} href={to}>{children}</a>
);

export type HostWorkItemProps = {
  item: HostWorkboxItemView;
  pending: boolean;
  error?: string | null;
  now?: Date;
  onDefer: (key: string, option: HostWorkboxDeferralOption) => void;
  onUndoDeferral: (key: string) => void;
  LinkComponent?: ComponentType<WorkItemLinkProps>;
};

export function HostWorkItem({
  item,
  pending,
  error = null,
  now = new Date(),
  onDefer,
  onUndoDeferral,
  LinkComponent = DefaultLink,
}: HostWorkItemProps) {
  const [deferralOption, setDeferralOption] = useState<HostWorkboxDeferralOption>("TOMORROW");
  const overdue = item.state === "NOW" && item.dueAt !== null && new Date(item.dueAt).getTime() < now.getTime();

  return (
    <li className="rm-host-work-item" aria-label={item.title} data-state={item.state}>
      <div className="rm-host-work-item__heading">
        <span>{item.operationalLabel}</span>
        {overdue ? <strong>기한 지남</strong> : null}
      </div>
      <LinkComponent to={item.destinationHref} className="rm-host-work-item__destination">
        {item.title}
      </LinkComponent>
      <p>{item.description}</p>
      <dl className="rm-host-work-item__facts">
        <div><dt>수량</dt><dd>{item.countLabel}</dd></div>
        {item.deferredUntil ? <div><dt>보류 기한</dt><dd>{formatDateTime(item.deferredUntil)}</dd></div> : null}
        {item.resolvedAt ? <div><dt>처리 시각</dt><dd>{formatDateTime(item.resolvedAt)}</dd></div> : null}
      </dl>

      {item.state === "NOW" ? (
        <div className="rm-host-work-item__deferral">
          <label>
            <span className="sr-only">{item.title} 보류 기간</span>
            <select
              aria-label={`${item.title} 보류 기간`}
              value={deferralOption}
              disabled={pending}
              onChange={(event) => setDeferralOption(event.currentTarget.value as HostWorkboxDeferralOption)}
            >
              <option value="TOMORROW">내일 오전 9시</option>
              <option value="THREE_DAYS">3일 뒤 오전 9시</option>
              <option value="NEXT_WEEK">7일 뒤 오전 9시</option>
            </select>
          </label>
          <button
            type="button"
            disabled={pending}
            onClick={() => onDefer(item.key, deferralOption)}
            aria-label={`${item.title} 보류`}
          >
            {pending ? "보류 중" : "보류"}
          </button>
        </div>
      ) : null}

      {item.state === "DEFERRED" ? (
        <button
          type="button"
          className="rm-host-work-item__undo"
          disabled={pending}
          onClick={() => onUndoDeferral(item.key)}
          aria-label={`${item.title} 보류 해제`}
        >
          {pending ? "해제 중" : "지금 다시 보기"}
        </button>
      ) : null}

      {item.state === "COMPLETED" && item.receiptSummary ? (
        <OperationReceipt
          outcome={operationReceiptOutcome(item.receiptSummary.outcome)}
          title={receiptTitle(item.receiptSummary.operation)}
          detail={item.receiptSummary.affectedCount === null
            ? "서버가 기록한 완료 결과"
            : `서버가 기록한 완료 결과 · 처리 ${item.receiptSummary.affectedCount}명`}
          LinkComponent={LinkComponent}
        />
      ) : null}

      {error ? <p className="rm-host-work-item__error" role="alert">{error}</p> : null}
    </li>
  );
}

function receiptTitle(operation: string): string {
  if (operation === "SCHEDULE_REMINDER") return "일정 알림";
  return "작업 결과";
}

function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("ko-KR", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}
