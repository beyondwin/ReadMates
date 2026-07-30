import { useEffect, useId, useRef, useState } from "react";
import { scopedPublicLinkTarget } from "@/shared/routing/scoped-app-link-target";

export function DangerZone({
  onLeaveMembership,
}: {
  onLeaveMembership: () => Promise<void>;
}) {
  const confirmationId = useId();
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [leaveMessage, setLeaveMessage] = useState<string | null>(null);
  const [leaveError, setLeaveError] = useState<string | null>(null);
  const [isLeaving, setIsLeaving] = useState(false);
  const leaveTriggerRef = useRef<HTMLButtonElement>(null);
  const shouldRestoreFocusRef = useRef(false);

  useEffect(() => {
    if (!leaveOpen && shouldRestoreFocusRef.current) {
      shouldRestoreFocusRef.current = false;
      leaveTriggerRef.current?.focus();
    }
  }, [leaveOpen]);

  const handleLeave = async () => {
    setIsLeaving(true);
    setLeaveError(null);

    try {
      await onLeaveMembership();
      setLeaveMessage("탈퇴 처리되었습니다.");
      globalThis.location.href = scopedPublicLinkTarget(globalThis.location.pathname, "/about");
    } catch {
      setLeaveError("탈퇴 처리에 실패했습니다. 잠시 후 다시 시도해 주세요.");
    } finally {
      setIsLeaving(false);
    }
  };

  return (
    <section
      className="surface-quiet rm-account-settings-page__termination"
      aria-labelledby="membership-termination-heading"
    >
      <h2 id="membership-termination-heading">멤버십 종료</h2>
      <div className="rm-account-settings-page__termination-row">
        <p>
          클럽 탈퇴 · 내 기록은 유지, 내 이름은 비공개 처리됩니다.
        </p>
        <button
          ref={leaveTriggerRef}
          type="button"
          className="btn btn-ghost btn-sm"
          aria-expanded={leaveOpen}
          aria-controls={confirmationId}
          onClick={() => setLeaveOpen((current) => !current)}
        >
          클럽 탈퇴…
        </button>
      </div>
      {leaveOpen ? (
        <div
          id={confirmationId}
          className="surface rm-account-settings-page__termination-confirm"
        >
          <p>
            탈퇴하면 과거 기록은 보존되며, 다른 멤버에게는 작성자가
            &quot;탈퇴한 멤버&quot;로 표시됩니다.
          </p>
          <div className="rm-account-settings-page__termination-actions">
            <button
              type="button"
              className="btn btn-quiet btn-sm"
              disabled={isLeaving}
              onClick={() => {
                shouldRestoreFocusRef.current = true;
                setLeaveOpen(false);
              }}
            >
              취소
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-sm rm-account-settings-page__danger-action"
              disabled={isLeaving}
              onClick={handleLeave}
            >
              {isLeaving ? "탈퇴 처리 중" : "클럽 탈퇴"}
            </button>
          </div>
        </div>
      ) : null}
      {leaveMessage ? (
        <p role="status" className="small rm-account-settings-page__success">
          {leaveMessage}
        </p>
      ) : null}
      {leaveError ? (
        <p role="alert" className="small rm-account-settings-page__error">
          {leaveError}
        </p>
      ) : null}
    </section>
  );
}
