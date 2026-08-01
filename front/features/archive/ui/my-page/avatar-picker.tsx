import {
  type KeyboardEvent,
  type MouseEvent,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { AvatarChip } from "@/shared/ui/avatar-chip";
import {
  BOOK_CLUB_AVATARS,
  normalizeBookClubAvatarKey,
  type BookClubAvatarKey,
} from "@/shared/ui/book-club-avatar";

type AvatarUpdateResult = {
  avatarKey: string;
};

export type AvatarPickerProps = {
  avatarKey: unknown;
  canEditProfile: boolean;
  onUpdateAvatar: (avatarKey: BookClubAvatarKey) => Promise<AvatarUpdateResult>;
};

const focusableSelector = [
  "button:not([disabled])",
  "[href]",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(", ");

export function AvatarPicker({
  avatarKey,
  canEditProfile,
  onUpdateAvatar,
}: AvatarPickerProps) {
  const normalizedAvatarKey = normalizeBookClubAvatarKey(avatarKey);
  const titleId = useId();
  const descriptionId = useId();
  const [open, setOpen] = useState(false);
  const [draftKey, setDraftKey] = useState<BookClubAvatarKey>(normalizedAvatarKey);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const openerRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const savingRef = useRef(false);

  useEffect(() => {
    if (!open) {
      return;
    }

    const opener = openerRef.current;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const selectedTile = dialogRef.current?.querySelector<HTMLElement>(
      '[aria-pressed="true"]',
    );
    (selectedTile ?? dialogRef.current)?.focus();

    return () => {
      document.body.style.overflow = previousOverflow;
      if (opener?.isConnected) {
        opener.focus();
      }
    };
  }, [open]);

  useEffect(() => {
    if (saving) {
      dialogRef.current?.focus();
    }
  }, [saving]);

  function openPicker() {
    setDraftKey(normalizedAvatarKey);
    setError(null);
    setOpen(true);
  }

  function dismissPicker() {
    if (savingRef.current) {
      return;
    }

    setOpen(false);
    setDraftKey(normalizedAvatarKey);
    setError(null);
  }

  async function saveDraft() {
    if (
      savingRef.current ||
      !canEditProfile ||
      draftKey === normalizedAvatarKey
    ) {
      return;
    }

    savingRef.current = true;
    setSaving(true);
    setError(null);
    try {
      await onUpdateAvatar(draftKey);
      setOpen(false);
    } catch {
      setError("아바타를 변경하지 못했습니다. 다시 시도해 주세요.");
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key === "Escape") {
      if (!savingRef.current) {
        event.preventDefault();
        dismissPicker();
      }
      return;
    }

    if (event.key !== "Tab") {
      return;
    }

    const dialog = dialogRef.current;
    if (!dialog) {
      return;
    }

    const focusableElements = Array.from(
      dialog.querySelectorAll<HTMLElement>(focusableSelector),
    ).filter((element) => element !== dialog);

    if (focusableElements.length === 0) {
      event.preventDefault();
      dialog.focus();
      return;
    }

    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];
    const activeElement = document.activeElement;
    const focusIsInsideDialog =
      activeElement instanceof Node && dialog.contains(activeElement);

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

  function handleBackdrop(event: MouseEvent<HTMLDivElement>) {
    if (event.target === event.currentTarget && !savingRef.current) {
      dismissPicker();
    }
  }

  if (!canEditProfile) {
    return (
      <span className="rm-avatar-picker rm-avatar-picker--decorative" aria-hidden="true">
        <AvatarChip avatarKey={normalizedAvatarKey} name={null} label="" size={46} />
      </span>
    );
  }

  return (
    <>
      <button
        ref={openerRef}
        type="button"
        className="rm-avatar-picker__opener"
        aria-label="아바타 바꾸기"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={openPicker}
      >
        <AvatarChip avatarKey={normalizedAvatarKey} name={null} label="" size={46} />
        <span className="rm-avatar-picker__opener-copy">
          <PencilIcon />
          <span>아바타 바꾸기</span>
        </span>
      </button>
      {open
        ? createPortal(
            <div
              role="presentation"
              className="rm-avatar-picker__scrim"
              onClick={handleBackdrop}
            >
              <section
                ref={dialogRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby={titleId}
                aria-describedby={descriptionId}
                tabIndex={-1}
                className="rm-avatar-picker__dialog"
                onKeyDown={handleKeyDown}
              >
                <header className="rm-avatar-picker__header">
                  <div>
                    <h2 id={titleId}>나의 아바타 선택</h2>
                    <p id={descriptionId}>마음에 드는 아바타를 고른 뒤 변경해 주세요.</p>
                  </div>
                  <button
                    type="button"
                    className="rm-avatar-picker__close"
                    aria-label="아바타 선택 닫기"
                    disabled={saving}
                    onClick={dismissPicker}
                  >
                    <CloseIcon />
                  </button>
                </header>
                <div className="rm-avatar-picker__body">
                  <div className="rm-avatar-picker__grid" aria-label="아바타 목록">
                    {BOOK_CLUB_AVATARS.map(({ key, label }) => {
                      const selected = key === draftKey;
                      return (
                        <button
                          key={key}
                          type="button"
                          className="rm-avatar-picker__tile"
                          aria-label={`${label} 선택`}
                          aria-pressed={selected}
                          disabled={saving}
                          onClick={() => {
                            setDraftKey(key);
                            setError(null);
                          }}
                        >
                          <AvatarChip avatarKey={key} name={null} label="" size={52} />
                          <span className="rm-sr-only">{label}</span>
                          {selected ? <CheckIcon /> : null}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <footer className="rm-avatar-picker__footer">
                  {error ? (
                    <p role="alert" className="rm-avatar-picker__error">
                      {error}
                    </p>
                  ) : (
                    <span />
                  )}
                  <div className="rm-avatar-picker__actions">
                    <button
                      type="button"
                      className="btn btn-quiet rm-avatar-picker__cancel"
                      disabled={saving}
                      onClick={dismissPicker}
                    >
                      취소
                    </button>
                    <button
                      type="button"
                      className="btn btn-primary rm-avatar-picker__save"
                      disabled={saving || draftKey === normalizedAvatarKey}
                      onClick={saveDraft}
                    >
                      {saving ? "변경 중…" : "이 아바타로 변경"}
                    </button>
                  </div>
                </footer>
              </section>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}

function PencilIcon() {
  return (
    <svg aria-hidden="true" focusable="false" viewBox="0 0 20 20">
      <path d="m4 13.75-.6 2.85 2.85-.6 8.5-8.5-2.25-2.25-8.5 8.5Z" />
      <path d="m11.8 5.95 2.25 2.25" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg aria-hidden="true" focusable="false" viewBox="0 0 20 20">
      <path d="m5 5 10 10M15 5 5 15" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <span className="rm-avatar-picker__check" aria-hidden="true">
      <svg focusable="false" viewBox="0 0 20 20">
        <path d="m4.5 10.5 3.25 3.25L15.5 6" />
      </svg>
    </span>
  );
}
