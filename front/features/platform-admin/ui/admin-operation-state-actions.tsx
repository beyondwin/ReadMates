import { useEffect, useState } from "react";

type LifecycleAction = "ACKNOWLEDGE" | "SNOOZE" | "RESOLVE";

export type AdminOperationActionMessage = {
  kind: "conflict" | "error" | "success";
  text: string;
};

type Props = {
  allowedActions: readonly LifecycleAction[];
  pending: boolean;
  message: AdminOperationActionMessage | null;
  now?: () => Date;
  onAcknowledge: () => void;
  onSnooze: (snoozedUntil: string) => void;
  onResolve: () => void;
};

const HOUR_MS = 60 * 60 * 1_000;

export function AdminOperationStateActions({
  allowedActions,
  pending,
  message,
  now = () => new Date(),
  onAcknowledge,
  onSnooze,
  onResolve,
}: Props) {
  const [resolveOpen, setResolveOpen] = useState(false);

  useEffect(() => {
    if (!resolveOpen) return;
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setResolveOpen(false);
    }
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [resolveOpen]);

  function snooze(hours: number) {
    onSnooze(new Date(now().getTime() + hours * HOUR_MS).toISOString());
  }

  function confirmResolve() {
    setResolveOpen(false);
    onResolve();
  }

  return (
    <div className="admin-operation-actions">
      <div className="admin-operation-actions__controls">
        {allowedActions.includes("ACKNOWLEDGE") ? (
          <button type="button" className="btn btn-secondary" disabled={pending} onClick={onAcknowledge}>
            확인 처리
          </button>
        ) : null}
        {allowedActions.includes("SNOOZE") ? (
          <>
            <button type="button" className="btn btn-secondary" disabled={pending} onClick={() => snooze(1)}>
              1시간 보류
            </button>
            <button type="button" className="btn btn-secondary" disabled={pending} onClick={() => snooze(4)}>
              4시간 보류
            </button>
            <button type="button" className="btn btn-secondary" disabled={pending} onClick={() => snooze(24)}>
              24시간 보류
            </button>
            <button type="button" className="btn btn-secondary" disabled={pending} onClick={() => snooze(168)}>
              7일 보류
            </button>
          </>
        ) : null}
        {allowedActions.includes("RESOLVE") ? (
          <button type="button" className="btn btn-secondary" disabled={pending} onClick={() => setResolveOpen(true)}>
            해결 확인
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
        <div
          className="admin-operation-actions__backdrop"
          data-testid="resolve-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setResolveOpen(false);
          }}
        >
          <div className="admin-operation-actions__dialog" role="dialog" aria-modal="true" aria-labelledby="resolve-title">
            <h4 id="resolve-title">해결 상태 확인</h4>
            <p>현재 source를 다시 검증해 신호가 사라졌을 때만 해결됩니다.</p>
            <div className="admin-operation-actions__dialog-buttons">
              <button type="button" className="btn btn-secondary" onClick={() => setResolveOpen(false)}>
                닫기
              </button>
              <button type="button" className="btn btn-primary" disabled={pending} onClick={confirmResolve}>
                신호 재검증 후 해결
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
