import { type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, useEffect, useRef } from "react";
import type { CurrentSessionPolicy } from "@/features/host/model/host-view-types";
import type { LifecycleDialog } from "./types";

export function LifecyclePolicyDialog({
  dialog,
  policy,
  submitting,
  onPolicyChange,
  onClose,
  onConfirm,
}: {
  dialog: Exclude<LifecycleDialog, null>;
  policy: CurrentSessionPolicy;
  submitting: boolean;
  onPolicyChange: (policy: CurrentSessionPolicy) => void;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const title = dialog.action === "suspend" ? `${dialog.member.displayName}님을 정지할까요?` : `${dialog.member.displayName}님을 탈퇴 처리할까요?`;
  const description =
    `${dialog.member.displayName} 님을 ${dialog.action === "suspend" ? "쉬는 멤버로 전환" : "클럽에서 내보내기"}합니다. 참석 기록은 보존되고, 내보낸 뒤 개인 정보는 익명화됩니다.`;
  const applyNowLabel = dialog.action === "suspend" ? "이번 모임부터 바로 정지" : "이번 모임에서 제외";
  const nextSessionLabel = dialog.action === "suspend" ? "다음 모임부터 정지" : "다음 모임부터 제외";
  const confirmLabel = dialog.action === "suspend" ? "정지" : "탈퇴 처리";
  const dialogRef = useRef<HTMLDivElement>(null);
  const cancelButtonRef = useRef<HTMLButtonElement>(null);
  const confirmButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const focusTarget = cancelButtonRef.current ?? confirmButtonRef.current ?? dialogRef.current;
    focusTarget?.focus();
  }, []);

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      if (!submitting) {
        event.preventDefault();
        onClose();
      }
      return;
    }

    if (event.key !== "Tab") {
      return;
    }

    const focusableElements = Array.from(
      dialogRef.current?.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ) ?? [],
    );

    if (focusableElements.length === 0) {
      event.preventDefault();
      dialogRef.current?.focus();
      return;
    }

    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];
    const activeElement = document.activeElement;
    const focusIsInsideDialog = activeElement instanceof Node && Boolean(dialogRef.current?.contains(activeElement));

    if (event.shiftKey) {
      if (activeElement === firstElement || !focusIsInsideDialog) {
        event.preventDefault();
        lastElement.focus();
      }
      return;
    }

    if (activeElement === lastElement || !focusIsInsideDialog) {
      event.preventDefault();
      firstElement.focus();
    }
  };

  return (
    <div
      role="presentation"
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(22, 24, 29, 0.46)",
        zIndex: 70,
        display: "grid",
        placeItems: "center",
        padding: "20px",
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="member-lifecycle-title"
        className="surface"
        tabIndex={-1}
        onKeyDown={handleKeyDown}
        style={{ width: "min(460px, 100%)", padding: "24px" }}
      >
        <h2 id="member-lifecycle-title" style={{ margin: 0 }}>
          {title}
        </h2>
        <p className="small" style={{ color: "var(--text-2)", margin: "10px 0 18px" }}>
          {description}
        </p>

        <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
          <legend className="label">현재 모임 반영</legend>
          <div className="stack" style={{ "--stack": "10px" } as CSSProperties}>
            <label className="row" style={{ gap: 8, alignItems: "center" }}>
              <input
                type="radio"
                name="current-session-policy"
                value="APPLY_NOW"
                checked={policy === "APPLY_NOW"}
                onChange={() => onPolicyChange("APPLY_NOW")}
              />
              <span className="small">{applyNowLabel}</span>
            </label>
            <label className="row" style={{ gap: 8, alignItems: "center" }}>
              <input
                type="radio"
                name="current-session-policy"
                value="NEXT_SESSION"
                checked={policy === "NEXT_SESSION"}
                onChange={() => onPolicyChange("NEXT_SESSION")}
              />
              <span className="small">{nextSessionLabel}</span>
            </label>
          </div>
        </fieldset>

        <div className="actions" style={{ marginTop: "22px", justifyContent: "flex-end" }}>
          <button ref={cancelButtonRef} className="btn btn-ghost btn-sm" type="button" disabled={submitting} onClick={onClose}>
            취소
          </button>
          <button ref={confirmButtonRef} className="btn btn-primary btn-sm" type="button" disabled={submitting} onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
