import { useId } from "react";
import {
  notificationEventLabels,
  notificationEventOrder,
  type NotificationPreferenceEventType,
  type NotificationPreferencesLoadState,
} from "../model/notification-preferences-model";
import { MemberNotificationTabs } from "./member-notification-tabs";

export type MemberNotificationSettingsPageProps = {
  state: NotificationPreferencesLoadState;
  basePath: string;
  saving: boolean;
  saveError: string | null;
  onEmailEnabledChange: (enabled: boolean) => void;
  onEventEnabledChange: (
    eventType: NotificationPreferenceEventType,
    enabled: boolean,
  ) => void;
  onSave: () => void;
  onRetryLoad: () => void;
};

export function MemberNotificationSettingsPage({
  state,
  basePath,
  saving,
  saveError,
  onEmailEnabledChange,
  onEventEnabledChange,
  onSave,
  onRetryLoad,
}: MemberNotificationSettingsPageProps) {
  return (
    <main className="rm-member-notifications-page">
      <section className="container rm-member-notifications-page__body">
        <header className="rm-member-notifications-header">
          <div>
            <h1 className="rm-member-notifications-header__title">알림</h1>
            <p className="rm-member-notifications-header__summary">
              받고 싶은 이메일 알림을 직접 선택합니다.
            </p>
          </div>
        </header>

        <MemberNotificationTabs active="settings" basePath={basePath} />

        {state.status === "error" ? (
          <section
            className="rm-member-notification-settings__state"
            aria-labelledby="member-notification-settings-heading"
          >
            <h2 id="member-notification-settings-heading">수신 설정</h2>
            <p role="alert">알림 설정을 불러오지 못했습니다.</p>
            <button
              type="button"
              className="btn btn-quiet"
              onClick={onRetryLoad}
            >
              다시 시도
            </button>
          </section>
        ) : state.status === "unavailable" ? (
          <section
            className="rm-member-notification-settings__state"
            aria-labelledby="member-notification-settings-heading"
          >
            <h2 id="member-notification-settings-heading">수신 설정</h2>
            <p>알림 수신은 현재 멤버십에서 제공되지 않습니다.</p>
          </section>
        ) : (
          <section
            className="rm-member-notification-settings"
            aria-labelledby="member-notification-settings-heading"
          >
            <div className="rm-member-notification-settings__intro">
              <h2 id="member-notification-settings-heading">수신 설정</h2>
              <p>변경한 내용은 저장 버튼을 눌러야 적용됩니다.</p>
            </div>
            <div className="rm-member-notification-settings__surface">
              <NotificationSwitchRow
                label="이메일 알림"
                description="ReadMates에서 보내는 이메일 알림 전체"
                checked={state.preferences.emailEnabled}
                disabled={saving}
                onChange={onEmailEnabledChange}
              />
              {notificationEventOrder.map((eventType) => (
                <NotificationSwitchRow
                  key={eventType}
                  label={notificationEventLabels[eventType].label}
                  description={
                    state.preferences.emailEnabled
                      ? notificationEventLabels[eventType].sub
                      : "전체 알림 꺼짐"
                  }
                  checked={state.preferences.events[eventType]}
                  disabled={saving || !state.preferences.emailEnabled}
                  onChange={(enabled) => onEventEnabledChange(eventType, enabled)}
                />
              ))}
              {saveError ? (
                <p
                  role="alert"
                  className="rm-member-notification-settings__save-error"
                >
                  {saveError}
                </p>
              ) : null}
              <div className="rm-member-notification-settings__save">
                <button
                  className="btn btn-primary"
                  type="button"
                  disabled={saving}
                  onClick={onSave}
                >
                  {saving ? "저장 중" : "알림 설정 저장"}
                </button>
              </div>
            </div>
          </section>
        )}
      </section>
    </main>
  );
}

function NotificationSwitchRow({
  label,
  description,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  disabled: boolean;
  onChange: (checked: boolean) => void;
}) {
  const id = useId();
  const descriptionId = useId();

  return (
    <div className="rm-member-notification-settings__row">
      <div>
        <label htmlFor={id}>{label}</label>
        <p id={descriptionId}>{description}</p>
      </div>
      <label className="rm-member-notification-settings__switch" htmlFor={id}>
        <input
          id={id}
          type="checkbox"
          role="switch"
          aria-label={label}
          aria-describedby={descriptionId}
          checked={checked}
          disabled={disabled}
          onChange={(event) => onChange(event.currentTarget.checked)}
        />
        <span
          className="rm-member-notification-settings__track"
          data-checked={checked ? "true" : "false"}
          aria-hidden="true"
        >
          <span className="rm-member-notification-settings__thumb" />
        </span>
      </label>
    </div>
  );
}
