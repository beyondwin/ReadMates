import { type CSSProperties, type FormEvent, type ReactNode, useId, useRef, useState } from "react";
import type { MyPageProfile } from "@/features/archive/model/archive-model";
import { profileSaveErrorMessage } from "@/features/archive/model/archive-model";
import type { ProfileUpdateResult } from "./types";

export type ProfileNameEditorProps = {
  data: MyPageProfile;
  canEditProfile?: boolean;
  onUpdateProfile: (displayName: string) => Promise<ProfileUpdateResult>;
  variant: "settings" | "member-space";
  headingId?: string;
  memberSpaceActions?: ReactNode;
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
  variant,
  headingId,
  memberSpaceActions,
}: ProfileNameEditorProps) {
  const inputId = useId();
  const errorId = useId();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({ sourceDisplayName: data.displayName, value: data.displayName });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const value = draft.sourceDisplayName === data.displayName ? draft.value : data.displayName;

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
      setDraft({ sourceDisplayName: profile.displayName, value: profile.displayName });
      setEditing(false);
    } catch (profileError) {
      setError(profileFailureMessage(profileError));
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  const isSettings = variant === "settings";
  const rowStyle: CSSProperties | undefined = isSettings
    ? {
        display: "grid",
        gridTemplateColumns: "28px minmax(0, 1fr)",
        gap: "14px",
        padding: "16px 18px",
        alignItems: "center",
      }
    : undefined;

  const bodyStyle: CSSProperties =
    isSettings
      ? { display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto", gap: "14px", alignItems: "center" }
      : undefined;

  const formStyle: CSSProperties =
    isSettings
      ? { display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto auto", gap: "8px", alignItems: "end" }
      : undefined;

  return (
    <div className={isSettings ? undefined : "rm-member-profile__editor"} style={rowStyle}>
      {isSettings ? (
        <span aria-hidden style={{ color: "var(--text-3)" }}>
          <Icon name="me" size={16} />
        </span>
      ) : null}
      <div className={isSettings ? undefined : "rm-member-profile__name"} style={isSettings ? { minWidth: 0 } : undefined}>
        {isSettings ? null : <h1 id={headingId}>{data.displayName}</h1>}
        {editing ? (
          <form className={isSettings ? undefined : "rm-member-profile__form"} onSubmit={submitProfile} style={formStyle}>
            <div style={{ minWidth: 0 }}>
              <label htmlFor={inputId} className="body" style={{ display: "block", fontSize: "14px" }}>
                이름
              </label>
              <input
                id={inputId}
                className="input"
                value={value}
                disabled={saving}
                aria-describedby={error ? errorId : undefined}
                onChange={(event) => setDraft({ sourceDisplayName: data.displayName, value: event.currentTarget.value })}
                style={{
                  width: "100%",
                  minWidth: 0,
                  marginTop: "7px",
                  height: isSettings ? "36px" : "40px",
                }}
              />
              {error ? (
                <div id={errorId} role="alert" className="tiny" style={{ color: "var(--danger)", marginTop: "7px" }}>
                  {error}
                </div>
              ) : null}
            </div>
            <button type="submit" className="btn btn-primary btn-sm" aria-label="이름 저장" disabled={saving}>
              {saving ? "저장 중" : "저장"}
            </button>
            <button
              type="button"
              className="btn btn-quiet btn-sm"
              disabled={saving}
              onClick={() => {
                setEditing(false);
                setError(null);
                setDraft({ sourceDisplayName: data.displayName, value: data.displayName });
              }}
            >
              취소
            </button>
          </form>
        ) : (
          <div className={isSettings ? undefined : "rm-member-profile__actions"} style={bodyStyle}>
            {isSettings ? (
              <div style={{ minWidth: 0 }}>
                <div className="body" style={{ fontSize: "14px" }}>
                  이름
                </div>
                <div className="tiny">{data.displayName}</div>
              </div>
            ) : null}
            {canEditProfile ? (
              <button
                type="button"
                className="btn btn-quiet btn-sm"
                aria-label={isSettings ? "이름 변경" : "프로필 수정"}
                onClick={() => {
                  setEditing(true);
                  setError(null);
                }}
              >
                <Icon name="edit" size={13} />
                <span>{isSettings ? "변경" : "프로필 수정"}</span>
              </button>
            ) : isSettings ? (
              <span className="tiny" aria-label="이름 변경 준비 중" style={{ color: "var(--text-3)" }}>
                변경 준비 중
              </span>
            ) : null}
            {!isSettings ? memberSpaceActions : null}
          </div>
        )}
      </div>
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

function Icon({
  name,
  size = 16,
}: {
  name: "edit" | "me";
  size?: number;
}) {
  const common = {
    width: size,
    height: size,
    viewBox: "0 0 20 20",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.7,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };

  if (name === "edit") {
    return (
      <svg {...common}>
        <path d="M4 16h3l8-8-3-3-8 8v3zM12 5l3 3" />
      </svg>
    );
  }

  return (
    <svg {...common}>
      <path d="M10 10a3 3 0 1 0 0-6 3 3 0 0 0 0 6z" />
      <path d="M4 17a6 6 0 0 1 12 0" />
    </svg>
  );
}
