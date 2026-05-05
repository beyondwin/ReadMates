import { type CSSProperties, type FormEvent, type KeyboardEvent as ReactKeyboardEvent, useEffect, useRef, useState } from "react";
import type { HostMemberListItem } from "@/features/host/ui/host-ui-types";
import { profileFailureMessage } from "./member-profile-errors";

export function HostMemberProfileDialog({
  member,
  submitting,
  onClose,
  onSubmit,
}: {
  member: HostMemberListItem;
  submitting: boolean;
  onClose: () => void;
  onSubmit: (displayName: string) => Promise<void>;
}) {
  const titleId = `member-profile-title-${member.membershipId}`;
  const inputId = `member-profile-display-name-${member.membershipId}`;
  const errorId = `member-profile-error-${member.membershipId}`;
  const [value, setValue] = useState(member.displayName);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const cancelButtonRef = useRef<HTMLButtonElement>(null);
  const busy = saving || submitting;

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      if (!busy) {
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

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (savingRef.current || submitting) {
      return;
    }

    savingRef.current = true;
    setSaving(true);
    setError(null);

    try {
      await onSubmit(value.trim());
      onClose();
    } catch (profileError) {
      setError(profileFailureMessage(profileError));
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

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
        aria-labelledby={titleId}
        className="surface"
        tabIndex={-1}
        onKeyDown={handleKeyDown}
        style={{ width: "min(420px, calc(100vw - 40px))", padding: "24px" }}
      >
        <h2 id={titleId} style={{ margin: 0 }}>
          {member.displayName} 이름 수정
        </h2>
        <p className="small" style={{ color: "var(--text-2)", margin: "10px 0 18px" }}>
          멤버 홈과 모임 기록에 표시되는 이름입니다.
        </p>

        <form onSubmit={handleSubmit} className="stack" style={{ "--stack": "16px" } as CSSProperties}>
          <div>
            <label htmlFor={inputId} className="label">
              이름
            </label>
            <input
              ref={inputRef}
              id={inputId}
              className="input"
              value={value}
              disabled={busy}
              aria-describedby={error ? errorId : undefined}
              onChange={(event) => setValue(event.currentTarget.value)}
              style={{ width: "100%", marginTop: 8 }}
            />
            {error ? (
              <div id={errorId} role="alert" className="tiny" style={{ color: "var(--danger)", marginTop: 8 }}>
                {error}
              </div>
            ) : null}
          </div>

          <div className="actions" style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 10, flexWrap: "wrap" }}>
            <button ref={cancelButtonRef} className="btn btn-ghost btn-sm" type="button" disabled={busy} onClick={onClose}>
              취소
            </button>
            <button className="btn btn-primary btn-sm" type="submit" aria-label="이름 저장" disabled={busy}>
              {busy ? "저장 중" : "저장"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
