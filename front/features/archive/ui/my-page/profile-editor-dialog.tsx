import { type KeyboardEvent, type MouseEvent, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { EditableMemberProfile } from "@/features/archive/model/profile-update";
import { ProfileUpdateFailure } from "@/features/archive/model/profile-update";
import { AvatarChip } from "@/shared/ui/avatar-chip";
import { bookClubAvatarLabel, normalizeBookClubAvatarKey } from "@/shared/ui/book-club-avatar";
import { AvatarPicker } from "./avatar-picker";
import type { SaveProfile } from "./types";

type ProfileEditorStep = "profile" | "avatar" | "discard";
type ProfileDraft = EditableMemberProfile;
type ProfileFieldErrors = Partial<Record<"displayName" | "avatarKey" | "form", string>>;

export type ProfileEditorDialogProps = {
  profile: EditableMemberProfile;
  opener: HTMLElement | null;
  onClose: () => void;
  onSaveProfile: SaveProfile;
};

const focusableSelector = "button:not([disabled]), input:not([disabled]), [href], [tabindex]:not([tabindex='-1'])";

export function ProfileEditorDialog({ profile, opener, onClose, onSaveProfile }: ProfileEditorDialogProps) {
  const initial = { displayName: profile.displayName, avatarKey: normalizeBookClubAvatarKey(profile.avatarKey) };
  const [draft, setDraft] = useState<ProfileDraft>(initial);
  const [step, setStep] = useState<ProfileEditorStep>("profile");
  const [errors, setErrors] = useState<ProfileFieldErrors>({});
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const dialogRef = useRef<HTMLElement>(null);
  const saveRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  const nameErrorId = useId();
  const avatarErrorId = useId();
  const formErrorId = useId();
  const dirty = draft.displayName.trim() !== initial.displayName.trim() || draft.avatarKey !== initial.avatarKey;

  function closeNow() {
    onClose();
    if (opener?.isConnected) opener.focus();
  }

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialogRef.current?.querySelector<HTMLElement>("input, button")?.focus();
    return () => {
      document.body.style.overflow = previousOverflow;
      if (opener?.isConnected) opener.focus();
    };
  }, [opener]);

  function requestClose() {
    if (savingRef.current) return;
    if (dirty) setStep("discard");
    else closeNow();
  }

  function handleBackdrop(event: MouseEvent<HTMLDivElement>) {
    if (event.target === event.currentTarget) requestClose();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      requestClose();
      return;
    }
    if (event.key !== "Tab") return;
    const dialog = dialogRef.current;
    if (!dialog) return;
    const controls = Array.from(dialog.querySelectorAll<HTMLElement>(focusableSelector));
    const first = controls[0];
    const last = controls.at(-1);
    if (!first || !last) return;
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  }

  async function save() {
    if (savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    setErrors({});
    try {
      await onSaveProfile({ ...draft, displayName: draft.displayName.trim() });
      closeNow();
    } catch (error) {
      const failure = error instanceof ProfileUpdateFailure ? error : null;
      const field = failure?.field ?? "form";
      setErrors({ [field]: failure?.message ?? "프로필을 저장하지 못했습니다. 다시 시도해 주세요." });
      if (field === "avatarKey") setStep("avatar");
      requestAnimationFrame(() => {
        if (field === "displayName") dialogRef.current?.querySelector<HTMLInputElement>("#profile-display-name")?.focus();
        else saveRef.current?.focus();
      });
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  return createPortal(
    <div className="rm-profile-editor__scrim" role="presentation" data-testid="profile-editor-scrim" onMouseDown={handleBackdrop}>
      <section ref={dialogRef} className="rm-profile-editor" role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={descriptionId} tabIndex={-1} onKeyDown={handleKeyDown}>
        <header className="rm-profile-editor__header">
          {step === "avatar" ? (
            <button type="button" className="rm-profile-editor__icon-action" aria-label="프로필로 돌아가기" disabled={saving} onClick={() => setStep("profile")}><BackIcon /></button>
          ) : <span />}
          <div>
            <h2 id={titleId}>{step === "discard" ? "변경사항을 버릴까요?" : step === "avatar" ? "아바타 선택" : "프로필 편집"}</h2>
            <p id={descriptionId}>{step === "discard" ? "저장하지 않은 이름과 아바타 선택이 사라집니다." : step === "avatar" ? "나를 표현할 아바타를 하나 골라 주세요." : "내 공간과 모임 기록에 보이는 프로필입니다."}</p>
          </div>
          {step !== "discard" ? <button type="button" className="rm-profile-editor__icon-action" aria-label="프로필 편집 닫기" disabled={saving} onClick={requestClose}><CloseIcon /></button> : <span />}
        </header>

        <div className="rm-profile-editor__body">
          {step === "profile" ? (
            <>
              <div className="rm-profile-editor__field">
                <label htmlFor="profile-display-name">표시 이름</label>
                <input id="profile-display-name" className="input" value={draft.displayName} maxLength={20} disabled={saving} aria-invalid={Boolean(errors.displayName)} aria-describedby={errors.displayName ? nameErrorId : "profile-name-help"} onChange={(event) => { setDraft({ ...draft, displayName: event.target.value }); setErrors({ ...errors, displayName: undefined }); }} />
                <small id="profile-name-help">20자 이내로 입력해 주세요.</small>
              </div>
              {errors.displayName ? <p className="rm-profile-editor__error" id={nameErrorId} role="alert">{errors.displayName}</p> : null}
              <div className="rm-profile-editor__avatar-field">
                <span>아바타</span>
                <button type="button" className="rm-profile-editor__avatar-action" aria-label="아바타 선택" disabled={saving} aria-describedby={errors.avatarKey ? avatarErrorId : undefined} onClick={() => setStep("avatar")}>
                  <AvatarChip avatarKey={draft.avatarKey} name={null} label="" size={64} />
                  <span><strong>{bookClubAvatarLabel(draft.avatarKey)}</strong><small>아바타 선택</small></span>
                </button>
              </div>
              {errors.avatarKey ? <p className="rm-profile-editor__error" id={avatarErrorId} role="alert">{errors.avatarKey}</p> : null}
            </>
          ) : null}
          {step === "avatar" ? <AvatarPicker value={draft.avatarKey} disabled={saving} errorId={errors.avatarKey ? avatarErrorId : undefined} onChange={(avatarKey) => { setDraft({ ...draft, avatarKey }); setErrors({ ...errors, avatarKey: undefined }); }} /> : null}
          {step === "avatar" && errors.avatarKey ? <p className="rm-profile-editor__error" id={avatarErrorId} role="alert">{errors.avatarKey}</p> : null}
          {step === "discard" ? <div className="rm-profile-editor__discard-copy">바꾼 내용을 저장하지 않고 프로필 편집을 닫을 수 있습니다.</div> : null}
        </div>

        <footer className="rm-profile-editor__footer">
          {errors.form ? <p className="rm-profile-editor__error" id={formErrorId} role="alert">{errors.form}</p> : null}
          {step === "discard" ? <div className="rm-profile-editor__footer-actions"><button type="button" className="button button--secondary" onClick={() => setStep("profile")}>계속 편집</button><button type="button" className="button button--danger" onClick={closeNow}>변경사항 버리기</button></div> : step === "profile" ? <button ref={saveRef} type="button" className="button button--primary rm-profile-editor__save" aria-busy={saving} disabled={saving} onClick={save}>{saving ? "저장 중…" : "변경사항 저장"}</button> : <button type="button" className="button button--primary rm-profile-editor__save" disabled={saving} onClick={() => setStep("profile")}>선택 완료</button>}
        </footer>
      </section>
    </div>, document.body,
  );
}

function CloseIcon() { return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" /></svg>; }
function BackIcon() { return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 18-6-6 6-6" /></svg>; }
