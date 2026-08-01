import { useEffect, useMemo, useRef, useState } from "react";
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

type SaveSource = {
  source: NotificationPreferencesLoadState;
  scope: string;
};

function matchesSaveSource(
  left: SaveSource,
  right: SaveSource,
) {
  return left.source === right.source && left.scope === right.scope;
}

export function MemberNotificationSettingsRoute() {
  const data = useLoaderData() as NotificationPreferencesLoadState;
  const location = useLocation();
  const revalidator = useRevalidator();
  const basePath = scopedAppLinkTarget(location.pathname, "/app");
  const mySpaceHref = scopedAppLinkTarget(location.pathname, "/app/me");
  const currentSource = useMemo(
    () => ({ source: data, scope: basePath }),
    [data, basePath],
  );
  const currentSourceRef = useRef<SaveSource>(currentSource);
  const pendingSaveRef = useRef<SaveSource | null>(null);
  const [pendingSave, setPendingSave] = useState<SaveSource | null>(null);
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
  const saving = pendingSave !== null && matchesSaveSource(pendingSave, currentSource);
  const state: NotificationPreferencesLoadState =
    data.status === "ready" && draft
      ? { status: "ready", preferences: draft }
      : data;

  useEffect(() => {
    currentSourceRef.current = currentSource;
  }, [currentSource]);

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
    const pending = pendingSaveRef.current;
    if (
      !draft ||
      (
        pending !== null &&
        matchesSaveSource(pending, currentSource)
      )
    ) {
      return;
    }

    const saveToken = currentSource;
    pendingSaveRef.current = saveToken;
    setPendingSave(saveToken);
    setErrorState({ source: data, message: null });
    try {
      const saved = await saveNotificationPreferences(draft);
      if (matchesSaveSource(currentSourceRef.current, saveToken)) {
        setDraftState({ source: data, draft: saved });
      }
    } catch {
      if (matchesSaveSource(currentSourceRef.current, saveToken)) {
        setErrorState({ source: data, message: SAVE_ERROR });
      }
    } finally {
      if (pendingSaveRef.current === saveToken) {
        pendingSaveRef.current = null;
      }
      setPendingSave((current) => current === saveToken ? null : current);
    }
  }

  return (
    <MemberNotificationSettingsPage
      state={state}
      basePath={basePath}
      mySpaceHref={mySpaceHref}
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
