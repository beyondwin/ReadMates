import { type CSSProperties, type FormEvent, type KeyboardEvent as ReactKeyboardEvent, useEffect, useRef, useState } from "react";
import { HostMemberProfileActionError } from "@/features/host/model/host-member-actions";
import { hostProfileErrorMessage, profileFailureMessage } from "@/features/host/ui/members/member-profile-errors";

function trapDialogKeys(
  event: ReactKeyboardEvent<HTMLDivElement>,
  dialogRef: { current: HTMLDivElement | null },
  busy: boolean,
  onClose: () => void,
) {
  if (event.key === "Escape") {
    if (!busy) {
      event.preventDefault();
      onClose();
    }
    return;
  }
  if (event.key !== "Tab") return;
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
}

function renameErrorMessage(error: unknown) {
  if (error instanceof HostMemberProfileActionError) {
    return hostProfileErrorMessage(error.status, error.code);
  }
  return profileFailureMessage(error);
}

export function HostPersonRenameDialog({
  displayName,
  submitting,
  onClose,
  onSubmit,
}: {
  displayName: string;
  submitting: boolean;
  onClose: () => void;
  onSubmit: (displayName: string) => Promise<void>;
}) {
  const titleId = "person-rename-title";
  const inputId = "person-rename-display-name";
  const errorId = "person-rename-error";
  const [value, setValue] = useState(displayName);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const busy = saving || submitting;

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (savingRef.current || submitting) return;
    savingRef.current = true;
    setSaving(true);
    setError(null);
    try {
      await onSubmit(value.trim());
      onClose();
    } catch (profileError) {
      setError(renameErrorMessage(profileError));
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
        onKeyDown={(event) => trapDialogKeys(event, dialogRef, busy, onClose)}
        style={{ width: "min(420px, calc(100vw - 40px))", padding: "24px" }}
      >
        <h2 id={titleId} style={{ margin: 0 }}>{displayName} 이름 수정</h2>
        <p className="small" style={{ color: "var(--text-2)", margin: "10px 0 18px" }}>
          멤버 홈과 모임 기록에 표시되는 이름입니다.
        </p>
        <form onSubmit={handleSubmit} className="stack" style={{ "--stack": "16px" } as CSSProperties}>
          <div>
            <label htmlFor={inputId} className="label">이름</label>
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
          <div className="actions" style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
            <button className="btn btn-ghost btn-sm" type="button" disabled={busy} onClick={onClose}>취소</button>
            <button className="btn btn-primary btn-sm" type="submit" aria-label="이름 저장" disabled={busy}>
              {busy ? "저장 중" : "저장"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function HostPersonExcludeDialog({
  displayName,
  submitting,
  error,
  onClose,
  onConfirm,
}: {
  displayName: string;
  submitting: boolean;
  error: string | null;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const titleId = "person-exclude-title";
  const dialogRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    cancelRef.current?.focus();
  }, []);

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
        onKeyDown={(event) => trapDialogKeys(event, dialogRef, submitting, onClose)}
        style={{ width: "min(420px, calc(100vw - 40px))", padding: "24px" }}
      >
        <h2 id={titleId} style={{ margin: 0 }}>{displayName}님을 이번 모임에서 제외할까요?</h2>
        <p className="small" style={{ color: "var(--text-2)", margin: "10px 0 18px" }}>
          이번 모임 참여자에서만 제외합니다. 멤버십은 그대로 둡니다.
        </p>
        {error ? <p role="alert" className="tiny" style={{ color: "var(--danger)" }}>{error}</p> : null}
        <div className="actions" style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
          <button ref={cancelRef} className="btn btn-ghost btn-sm" type="button" disabled={submitting} onClick={onClose}>
            취소
          </button>
          <button className="btn btn-primary btn-sm" type="button" disabled={submitting} onClick={onConfirm}>
            {submitting ? "처리 중" : "모임 제외"}
          </button>
        </div>
      </div>
    </div>
  );
}
