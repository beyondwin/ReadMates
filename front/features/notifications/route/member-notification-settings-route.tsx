import { useRef, useState } from "react";
import { useLoaderData, useLocation, useRevalidator } from "react-router-dom";
import { scopedAppLinkTarget } from "@/shared/routing/scoped-app-link-target";
import { saveNotificationPreferences } from "../api/notification-preferences-api";
import type {
  NotificationPreferenceEventType,
  NotificationPreferences,
  NotificationPreferencesLoadState,
} from "../model/notification-preferences-model";
import { MemberNotificationSettingsPage } from "../ui/member-notification-settings-page";

const SAVE_ERROR = "알림 설정 저장에 실패했습니다. 잠시 후 다시 시도해 주세요.";

export function MemberNotificationSettingsRoute() {
  const data = useLoaderData() as NotificationPreferencesLoadState;
  const location = useLocation();
  const revalidator = useRevalidator();
  const savingRef = useRef(false);
  const [saving, setSaving] = useState(false);
  const [draftState, setDraftState] = useState<{
    source: NotificationPreferencesLoadState;
    draft: NotificationPreferences;
  } | null>(null);
  const [errorState, setErrorState] = useState<{
    source: NotificationPreferencesLoadState;
    message: string | null;
  } | null>(null);
  const initialPreferences = data.status === "ready" ? data.preferences : null;
  const draft =
    initialPreferences && draftState?.source === data
      ? draftState.draft
      : initialPreferences;
  const saveError = errorState?.source === data ? errorState.message : null;
  const state: NotificationPreferencesLoadState =
    data.status === "ready" && draft
      ? { status: "ready", preferences: draft }
      : data;

  function updateDraft(
    updater: (current: NotificationPreferences) => NotificationPreferences,
  ) {
    if (!draft) {
      return;
    }

    setDraftState({ source: data, draft: updater(draft) });
    setErrorState({ source: data, message: null });
  }

  async function submit() {
    if (!draft || savingRef.current) {
      return;
    }

    savingRef.current = true;
    setSaving(true);
    setErrorState({ source: data, message: null });
    try {
      const saved = await saveNotificationPreferences(draft);
      setDraftState({ source: data, draft: saved });
    } catch {
      setErrorState({ source: data, message: SAVE_ERROR });
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  return (
    <MemberNotificationSettingsPage
      state={state}
      basePath={scopedAppLinkTarget(location.pathname, "/app")}
      saving={saving}
      saveError={saveError}
      onEmailEnabledChange={(enabled) => {
        updateDraft((current) => ({ ...current, emailEnabled: enabled }));
      }}
      onEventEnabledChange={(
        eventType: NotificationPreferenceEventType,
        enabled: boolean,
      ) => {
        updateDraft((current) => ({
          ...current,
          events: { ...current.events, [eventType]: enabled },
        }));
      }}
      onSave={() => {
        void submit();
      }}
      onRetryLoad={() => revalidator.revalidate()}
    />
  );
}
