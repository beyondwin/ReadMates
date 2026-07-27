import type { NotificationPreferences } from "@/features/archive/model/archive-model";
import { NotificationsSection } from "./my-page-sections";

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

  return <NotificationsSection preferences={state.preferences} onSave={onSave} />;
}
