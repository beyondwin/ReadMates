import { useRef, useState } from "react";
import { ADMIN_COPY } from "@/features/platform-admin/model/admin-copy";
import { AdminModalDialog } from "./admin-modal-dialog";

type LifecycleAction = "ACKNOWLEDGE" | "SNOOZE" | "RESOLVE";
type ExitPath = "hold" | "ignore";

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
  onSnooze: (snoozedUntil: string, reason: string) => void;
  onResolve: () => void;
};

const HOUR_MS = 60 * 60 * 1_000;
const IGNORE_HOLD_HOURS = 168;
const HOLD_DURATIONS = [
  { hours: 1, label: "1시간" },
  { hours: 4, label: "4시간" },
  { hours: 24, label: "24시간" },
  { hours: 168, label: "7일" },
] as const;

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
  const [exitSelection, setExitSelection] = useState<{ key: string; path: ExitPath } | null>(null);
  const [reason, setReason] = useState("");
  const [holdHours, setHoldHours] = useState(4);
  const resolveTriggerRef = useRef<HTMLElement | null>(null);
  const activeConfirmationKey = confirmationKey ?? "resolve";
  const exitKey = confirmationKey ?? "lifecycle";
  const resolveOpen = openConfirmationKey === activeConfirmationKey;
  const exitPath = exitSelection?.key === exitKey ? exitSelection.path : null;
  const locked = pending || disabled;
  const reasonReady = reason.trim().length > 0;
  const copy = ADMIN_COPY.queueExit;

  function selectPath(path: ExitPath) {
    if (exitSelection?.key !== exitKey || exitSelection.path !== path) {
      setReason("");
    }
    setExitSelection({ key: exitKey, path });
  }

  function submitSnooze(hours: number) {
    const trimmed = reason.trim();
    if (!trimmed) return;
    onSnooze(new Date(now().getTime() + hours * HOUR_MS).toISOString(), trimmed);
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
            {copy.acknowledge}
          </button>
        ) : null}
        {allowedActions.includes("SNOOZE") ? (
          <>
            <button
              type="button"
              className="btn btn-secondary"
              disabled={locked}
              aria-pressed={exitPath === "hold"}
              onClick={() => selectPath("hold")}
            >
              {copy.hold}
            </button>
            <label className="admin-operation-actions__duration">
              <span>{copy.holdDuration}</span>
              <select
                className="admin-operation-control--touch"
                aria-label={copy.holdDuration}
                value={holdHours}
                disabled={locked || exitPath === "ignore"}
                onChange={(event) => setHoldHours(Number(event.currentTarget.value))}
              >
                {HOLD_DURATIONS.map((duration) => (
                  <option key={duration.hours} value={duration.hours}>{duration.label}</option>
                ))}
              </select>
            </label>
            <button
              type="button"
              className="btn btn-quiet"
              disabled={locked}
              aria-pressed={exitPath === "ignore"}
              onClick={() => selectPath("ignore")}
            >
              {copy.ignore}
            </button>
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
            {copy.resolve}
          </button>
        ) : null}
      </div>

      {exitPath === "hold" ? (
        <div className="admin-operation-actions__reason">
          <p>{copy.holdHint}</p>
          <label>
            <span>{copy.holdReason}</span>
            <input
              className="admin-operation-control--touch"
              type="text"
              aria-label={copy.holdReason}
              value={reason}
              disabled={locked}
              onChange={(event) => setReason(event.currentTarget.value)}
            />
          </label>
          <button
            type="button"
            className="btn btn-secondary"
            disabled={locked || !reasonReady}
            onClick={() => submitSnooze(holdHours)}
          >
            {copy.holdConfirm}
          </button>
        </div>
      ) : null}

      {exitPath === "ignore" ? (
        <div className="admin-operation-actions__reason">
          <p>{copy.ignoreHint}</p>
          <label>
            <span>{copy.ignoreReason}</span>
            <input
              className="admin-operation-control--touch"
              type="text"
              aria-label={copy.ignoreReason}
              value={reason}
              disabled={locked}
              onChange={(event) => setReason(event.currentTarget.value)}
            />
          </label>
          <button
            type="button"
            className="btn btn-quiet"
            disabled={locked || !reasonReady}
            onClick={() => submitSnooze(IGNORE_HOLD_HOURS)}
          >
            {copy.ignoreConfirm}
          </button>
        </div>
      ) : null}

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
