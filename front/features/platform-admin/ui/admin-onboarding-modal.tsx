import { useEffect, useRef, type ReactNode, type RefObject } from "react";
import { AdminModalDialog } from "./admin-modal-dialog";

export type AdminOnboardingModalProps = {
  isDirty: boolean;
  effectPending?: boolean;
  onRequestClose: () => void;
  children: ReactNode;
  triggerRef?: RefObject<HTMLElement | null>;
};

export function AdminOnboardingModal({
  isDirty,
  effectPending = false,
  onRequestClose,
  children,
  triggerRef,
}: AdminOnboardingModalProps) {
  const fallbackTriggerRef = useRef<HTMLElement | null>(activeTrigger());
  const effectPendingRef = useRef(effectPending);
  effectPendingRef.current = effectPending;

  function requestClose() {
    if (effectPendingRef.current) return;
    if (isDirty) {
      const ok = window.confirm("작성 중인 내용이 사라집니다. 닫을까요?");
      if (!ok) return;
    }
    onRequestClose();
  }

  useEffect(() => {
    if (!isDirty && !effectPending) return;
    function onBeforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault();
      event.returnValue = "";
    }
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [effectPending, isDirty]);

  return (
    <AdminModalDialog
      titleId="admin-onboarding-modal-title"
      triggerRef={triggerRef ?? fallbackTriggerRef}
      onRequestClose={requestClose}
      className="admin-onboarding-modal"
    >
      <header className="admin-onboarding-modal__header">
        <h1 id="admin-onboarding-modal-title" className="h2">
          새 클럽
        </h1>
        <button
          type="button"
          className="admin-onboarding-modal__close"
          onClick={requestClose}
          disabled={effectPending}
          aria-label="닫기"
        >
          닫기
        </button>
      </header>
      <div className="admin-onboarding-modal__body">{children}</div>
    </AdminModalDialog>
  );
}

function activeTrigger(): HTMLElement | null {
  if (typeof document === "undefined") return null;
  const active = document.activeElement;
  return active instanceof HTMLElement && active !== document.body
    ? active
    : null;
}
