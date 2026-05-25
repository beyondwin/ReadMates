import { useEffect, useRef } from "react";
import type { ReactNode } from "react";

export type AdminOnboardingModalProps = {
  isDirty: boolean;
  onRequestClose: () => void;
  children: ReactNode;
};

export function AdminOnboardingModal({ isDirty, onRequestClose, children }: AdminOnboardingModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);

  function requestClose() {
    if (isDirty) {
      const ok = window.confirm("작성 중인 내용이 사라집니다. 닫을까요?");
      if (!ok) return;
    }
    onRequestClose();
  }

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.stopPropagation();
        requestClose();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDirty]);

  useEffect(() => {
    if (!isDirty) return;
    function onBeforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault();
      event.returnValue = "";
    }
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [isDirty]);

  useEffect(() => {
    const node = dialogRef.current;
    if (!node) return;
    const focusables = node.querySelectorAll<HTMLElement>(
      'a, button, input, select, textarea, [tabindex]:not([tabindex="-1"])',
    );
    if (focusables.length > 0) {
      focusables[0].focus();
    }
  }, []);

  return (
    <div
      className="admin-onboarding-modal"
      role="presentation"
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.stopPropagation();
          requestClose();
        }
      }}
    >
      <div
        className="admin-onboarding-modal__backdrop"
        onClick={() => requestClose()}
        aria-hidden="true"
      />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="admin-onboarding-modal-title"
        className="admin-onboarding-modal__dialog"
      >
        <header className="admin-onboarding-modal__header">
          <h1 id="admin-onboarding-modal-title" className="h2">새 클럽</h1>
          <button
            type="button"
            className="admin-onboarding-modal__close"
            onClick={() => requestClose()}
            aria-label="닫기"
          >
            닫기
          </button>
        </header>
        <div className="admin-onboarding-modal__body">{children}</div>
      </div>
    </div>
  );
}
