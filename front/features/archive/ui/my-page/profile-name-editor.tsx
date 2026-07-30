import { type FormEvent, useId, useRef, useState } from "react";
import type { MyPageProfile } from "@/features/archive/model/archive-model";
import { profileSaveErrorMessage } from "@/features/archive/model/archive-model";
import type { ProfileUpdateResult } from "./types";

export type ProfileNameEditorProps = {
  data: MyPageProfile;
  canEditProfile?: boolean;
  onUpdateProfile: (displayName: string) => Promise<ProfileUpdateResult>;
  headingId: string;
};

const profileFailureMessages = new Set([
  profileSaveErrorMessage("DISPLAY_NAME_REQUIRED"),
  profileSaveErrorMessage("DISPLAY_NAME_TOO_LONG"),
  profileSaveErrorMessage("DISPLAY_NAME_INVALID"),
  profileSaveErrorMessage("DISPLAY_NAME_RESERVED"),
  profileSaveErrorMessage("DISPLAY_NAME_DUPLICATE"),
  profileSaveErrorMessage("MEMBERSHIP_NOT_ALLOWED"),
  profileSaveErrorMessage(null),
]);

export function ProfileNameEditor({
  data,
  canEditProfile = true,
  onUpdateProfile,
  headingId,
}: ProfileNameEditorProps) {
  const inputId = useId();
  const errorId = useId();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({
    sourceDisplayName: data.displayName,
    value: data.displayName,
  });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const value =
    draft.sourceDisplayName === data.displayName
      ? draft.value
      : data.displayName;

  async function submitProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (savingRef.current || !canEditProfile) {
      return;
    }

    const trimmedValue = value.trim();
    savingRef.current = true;
    setSaving(true);
    setError(null);

    try {
      const profile = await onUpdateProfile(trimmedValue);
      setDraft({
        sourceDisplayName: profile.displayName,
        value: profile.displayName,
      });
      setEditing(false);
    } catch (profileError) {
      setError(profileFailureMessage(profileError));
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  return (
    <div className="rm-member-profile__name" data-editing={editing || undefined}>
      <div className="rm-member-profile__name-row">
        <h1 id={headingId}>{data.displayName}</h1>
        {!editing && canEditProfile ? (
          <button
            type="button"
            className="btn btn-quiet btn-sm rm-member-profile__edit"
            aria-label="이름 변경"
            onClick={() => {
              setEditing(true);
              setError(null);
            }}
          >
            <Icon size={13} />
            <span>이름 변경</span>
          </button>
        ) : null}
      </div>
      {editing ? (
        <form className="rm-member-profile__form" onSubmit={submitProfile}>
          <div className="rm-member-profile__field">
            <label htmlFor={inputId} className="body">
              이름
            </label>
            <input
              id={inputId}
              className="input"
              value={value}
              disabled={saving}
              aria-describedby={error ? errorId : undefined}
              onChange={(event) =>
                setDraft({
                  sourceDisplayName: data.displayName,
                  value: event.currentTarget.value,
                })
              }
            />
            {error ? (
              <div id={errorId} role="alert" className="tiny rm-member-profile__error">
                {error}
              </div>
            ) : null}
          </div>
          <button
            type="submit"
            className="btn btn-primary btn-sm"
            aria-label="이름 저장"
            disabled={saving}
          >
            {saving ? "저장 중" : "저장"}
          </button>
          <button
            type="button"
            className="btn btn-quiet btn-sm"
            disabled={saving}
            onClick={() => {
              setEditing(false);
              setError(null);
              setDraft({
                sourceDisplayName: data.displayName,
                value: data.displayName,
              });
            }}
          >
            취소
          </button>
        </form>
      ) : null}
    </div>
  );
}

function profileFailureMessage(error: unknown) {
  const message = error instanceof Error ? error.message.trim() : "";

  if (profileFailureMessages.has(message)) {
    return message;
  }

  return profileSaveErrorMessage(null);
}

function Icon({ size = 16 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M4 16h3l8-8-3-3-8 8v3zM12 5l3 3" />
    </svg>
  );
}
