import { type CSSProperties, useId, useRef, useState } from "react";
import {
  notificationEventLabels,
  notificationEventOrder,
  type NotificationPreferences,
} from "@/features/archive/model/archive-model";

export type NotificationPreferencesLoadState =
  | { status: "ready"; preferences: NotificationPreferences }
  | { status: "unavailable" }
  | { status: "error" };

type NotificationSettingsProps = {
  state: NotificationPreferencesLoadState;
  onRetryLoad: () => void;
  onSave: (request: NotificationPreferences) => Promise<NotificationPreferences>;
};

export function NotificationSettings({ state, onRetryLoad, onSave }: NotificationSettingsProps) {
  if (state.status === "error") {
    return (
      <section className="rm-my-shelf-settings__notification-error" aria-labelledby="my-page-notification-heading">
        <h3 id="my-page-notification-heading">알림</h3>
        <p role="alert">알림 설정을 불러오지 못했습니다.</p>
        <button type="button" className="btn btn-quiet" onClick={onRetryLoad}>
          다시 시도
        </button>
      </section>
    );
  }

  if (state.status === "unavailable") {
    return (
      <section className="rm-my-shelf-settings__notification-unavailable" aria-labelledby="my-page-notification-heading">
        <h3 id="my-page-notification-heading">알림</h3>
        <p>알림 수신은 현재 멤버십에서 제공되지 않습니다.</p>
      </section>
    );
  }

  return <NotificationPreferencesForm preferences={state.preferences} onSave={onSave} />;
}

function NotificationPreferencesForm({
  preferences,
  onSave,
}: {
  preferences: NotificationPreferences;
  onSave: (preferences: NotificationPreferences) => Promise<NotificationPreferences>;
}) {
  const [draftState, setDraftState] = useState({ source: preferences, draft: preferences });
  const [saving, setSaving] = useState(false);
  const [errorState, setErrorState] = useState<{ source: NotificationPreferences; message: string | null }>({
    source: preferences,
    message: null,
  });
  const savingRef = useRef(false);
  const draft = draftState.source === preferences ? draftState.draft : preferences;
  const error = errorState.source === preferences ? errorState.message : null;

  function setDraft(updater: (current: NotificationPreferences) => NotificationPreferences) {
    setDraftState({ source: preferences, draft: updater(draft) });
  }

  async function submit() {
    if (savingRef.current) {
      return;
    }

    savingRef.current = true;
    setSaving(true);
    setErrorState({ source: preferences, message: null });
    try {
      const saved = await onSave(draft);
      setDraftState({ source: preferences, draft: saved });
    } catch {
      setErrorState({ source: preferences, message: "알림 설정 저장에 실패했습니다. 잠시 후 다시 시도해 주세요." });
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  return (
    <section aria-labelledby="my-page-notification-heading">
      <h3 id="my-page-notification-heading">알림</h3>
      <div className="surface" style={{ padding: "6px" }}>
        <NotificationSwitchRow
          label="이메일 알림"
          sub="ReadMates에서 보내는 이메일 알림 전체"
          checked={draft.emailEnabled}
          disabled={saving}
          onChange={(checked) => {
            setDraft((current) => ({ ...current, emailEnabled: checked }));
            setErrorState({ source: preferences, message: null });
          }}
        />
        {notificationEventOrder.map((event) => (
          <NotificationSwitchRow
            key={event}
            label={notificationEventLabels[event].label}
            sub={draft.emailEnabled ? notificationEventLabels[event].sub : "전체 알림 꺼짐"}
            checked={draft.events[event]}
            disabled={saving || !draft.emailEnabled}
            onChange={(checked) => {
              setDraft((current) => ({ ...current, events: { ...current.events, [event]: checked } }));
              setErrorState({ source: preferences, message: null });
            }}
          />
        ))}
        {error ? <p role="alert" className="small rm-my-shelf-notification-save-error">{error}</p> : null}
        <div className="rm-my-shelf-notification-save">
          <button className="btn btn-primary btn-sm" type="button" disabled={saving} onClick={() => void submit()}>
            {saving ? "저장 중" : "알림 설정 저장"}
          </button>
        </div>
      </div>
    </section>
  );
}

function NotificationSwitchRow({
  label,
  sub,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  sub: string;
  checked: boolean;
  disabled: boolean;
  onChange: (checked: boolean) => void;
}) {
  const id = useId();
  const descriptionId = useId();
  const [focused, setFocused] = useState(false);
  const trackStyle: CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    width: "34px",
    height: "18px",
    padding: "2px",
    border: checked ? "1px solid var(--accent-line)" : "1px solid var(--line-soft)",
    borderRadius: "999px",
    background: checked ? "var(--accent-soft)" : "var(--bg-sub)",
    boxShadow: focused ? "0 0 0 3px var(--focus-ring-soft)" : undefined,
    opacity: disabled ? 0.58 : 1,
  };

  return (
    <div className="rm-my-shelf-notification-row">
      <div>
        <label className="body" htmlFor={id} style={{ display: "block", fontSize: "14px", fontWeight: 500 }}>
          {label}
        </label>
        <p id={descriptionId} className="tiny">{sub}</p>
      </div>
      <label className="rm-my-shelf-notification-switch" htmlFor={id}>
        <input
          id={id}
          type="checkbox"
          role="switch"
          aria-label={label}
          aria-describedby={descriptionId}
          checked={checked}
          disabled={disabled}
          onChange={(event) => onChange(event.currentTarget.checked)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
        />
        <span aria-hidden="true" style={trackStyle}>
          <span className={checked ? "rm-my-shelf-notification-switch__thumb is-on" : "rm-my-shelf-notification-switch__thumb"} />
        </span>
      </label>
    </div>
  );
}
