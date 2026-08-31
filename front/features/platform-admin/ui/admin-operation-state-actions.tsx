import { useRef, useState } from "react";
import { AdminModalDialog } from "./admin-modal-dialog";

type LifecycleAction = "ACKNOWLEDGE" | "SNOOZE" | "RESOLVE";

export type AdminOperationActionMessage = {
  kind: "conflict" | "error" | "success" | "unknown-outcome";
  text: string;
};

type Props = {
  allowedActions: readonly LifecycleAction[];
  pending: boolean;
  disabled?: boolean;
  message: AdminOperationActionMessage | null;
  confirmationKey?: string;
  now?: () => Date;
  onAcknowledge: () => void;
  onSnooze: (snoozedUntil: string) => void;
  onResolve: () => void;
};

const HOUR_MS = 60 * 60 * 1_000;
const HOLD_DURATIONS = [
  { hours: 1, label: "1시간" },
  { hours: 4, label: "4시간" },
  { hours: 24, label: "24시간" },
  { hours: 168, label: "7일" },
] as const;

const LIFECYCLE_COPY = {
  acknowledge: "확인함",
  snooze: "잠시 미룸",
  snoozeDuration: "미룰 시간",
  snoozeConfirm: "미루기",
  resolve: "처리함",
} as const;

export function AdminOperationStateActions({
  allowedActions,
  pending,
  disabled = false,
  message,
  confirmationKey,
  now = () => new Date(),
  onAcknowledge,
  onSnooze,
  onResolve,
}: Props) {
  const [openConfirmationKey, setOpenConfirmationKey] = useState<string | null>(null);
  const [openSnoozeKey, setOpenSnoozeKey] = useState<string | null>(null);
  const [holdHours, setHoldHours] = useState(4);
  const resolveTriggerRef = useRef<HTMLElement | null>(null);
  const activeConfirmationKey = confirmationKey ?? "resolve";
  const snoozeKey = confirmationKey ?? "lifecycle";
  const resolveOpen = openConfirmationKey === activeConfirmationKey;
  const snoozeOpen = openSnoozeKey === snoozeKey;
  const locked = pending || disabled;

  function submitSnooze(hours: number) {
    setOpenSnoozeKey(null);
    onSnooze(new Date(now().getTime() + hours * HOUR_MS).toISOString());
  }

  function confirmResolve() {
    setOpenConfirmationKey(null);
    onResolve();
  }

  return (
    <div className="admin-operation-actions">
      <div className="admin-operation-actions__controls">
        {allowedActions.includes("ACKNOWLEDGE") ? (
          <button type="button" className="btn btn-secondary" disabled={locked} onClick={onAcknowledge}>
            {LIFECYCLE_COPY.acknowledge}
          </button>
        ) : null}
        {allowedActions.includes("SNOOZE") ? (
          <>
            <button
              type="button"
              className="btn btn-secondary"
              disabled={locked}
              aria-pressed={snoozeOpen}
              onClick={() => setOpenSnoozeKey(snoozeOpen ? null : snoozeKey)}
            >
              {LIFECYCLE_COPY.snooze}
            </button>
            {snoozeOpen ? (
              <>
                <label className="admin-operation-actions__duration">
                  <span>{LIFECYCLE_COPY.snoozeDuration}</span>
                  <select
                    className="admin-operation-control--touch"
                    aria-label={LIFECYCLE_COPY.snoozeDuration}
                    value={holdHours}
                    disabled={locked}
                    onChange={(event) => setHoldHours(Number(event.currentTarget.value))}
                  >
                    {HOLD_DURATIONS.map((duration) => (
                      <option key={duration.hours} value={duration.hours}>{duration.label}</option>
                    ))}
                  </select>
                </label>
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={locked}
                  onClick={() => submitSnooze(holdHours)}
                >
                  {LIFECYCLE_COPY.snoozeConfirm}
                </button>
              </>
            ) : null}
          </>
        ) : null}
        {allowedActions.includes("RESOLVE") ? (
          <button
            ref={resolveTriggerRef}
            type="button"
            className="btn btn-secondary"
            disabled={locked}
            onClick={() => setOpenConfirmationKey(activeConfirmationKey)}
          >
            {LIFECYCLE_COPY.resolve}
          </button>
        ) : null}
      </div>

      {pending ? <p role="status">상태를 반영하고 있습니다.</p> : null}
      {message ? (
        <p role={message.kind === "success" ? "status" : "alert"}>
          {message.kind === "conflict"
            ? "최신 상태를 다시 불러왔습니다. 내용을 확인한 뒤 다시 시도해 주세요."
            : message.text}
        </p>
      ) : null}

      {resolveOpen ? (
        <AdminModalDialog
          titleId="resolve-title"
          triggerRef={resolveTriggerRef}
          onRequestClose={() => setOpenConfirmationKey(null)}
          backdropTestId="resolve-backdrop"
        >
          <h4 id="resolve-title">해결 상태 확인</h4>
          <p>현재 source를 다시 검증해 신호가 사라졌을 때만 해결됩니다.</p>
          <div className="admin-operation-actions__dialog-buttons">
            <button type="button" className="btn btn-secondary" onClick={() => setOpenConfirmationKey(null)}>
              닫기
            </button>
            <button type="button" className="btn btn-primary" disabled={locked} onClick={confirmResolve}>
              신호 재검증 후 해결
            </button>
          </div>
        </AdminModalDialog>
      ) : null}
    </div>
  );
}
