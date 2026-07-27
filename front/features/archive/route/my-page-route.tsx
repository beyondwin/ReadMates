import { useCallback, useRef, useState } from "react";
import { useLoaderData, useParams, useRevalidator } from "react-router-dom";
import {
  fetchMyJourney,
  leaveMembership,
  saveNotificationPreferences,
  updateMyProfile,
} from "@/features/archive/api/archive-api";
import type { MyJourneyItem, MyJourneyPage, MemberProfileErrorCode, MemberProfileResponse } from "@/features/archive/api/archive-contracts";
import { profileSaveErrorMessage } from "@/features/archive/model/archive-model";
import type { MyPageRouteData } from "@/features/archive/route/my-page-data";
import type { LogoutControlComponent } from "@/features/archive/ui/my-page";
import MyPage from "@/features/archive/ui/my-page";

type JourneyPaginationState = {
  pendingCursor: string | null;
  failedCursor: string | null;
};

function routeDataForLoader(data: MyPageRouteData, routeData: MyPageRouteData, source: MyPageRouteData) {
  return source === data ? routeData : data;
}

function appendUniqueJourneyItems(
  current: MyJourneyItem[],
  incoming: MyJourneyItem[],
): MyJourneyItem[] {
  const seen = new Set(current.map((item) => item.sessionId));
  return [...current, ...incoming.filter((item) => !seen.has(item.sessionId))];
}

async function submitLeaveMembership() {
  const response = await leaveMembership();

  if (!response.ok) {
    throw new Error("Leave membership failed");
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

async function profileErrorCodeFromResponse(response: Response): Promise<MemberProfileErrorCode | null> {
  try {
    const body: unknown = await response.json();
    const code = isRecord(body) ? body.code : null;

    return typeof code === "string" ? (code as MemberProfileErrorCode) : null;
  } catch {
    return null;
  }
}

export function MyPageRoute({
  LogoutButtonComponent,
  canEditProfile,
  onProfileUpdated,
}: {
  LogoutButtonComponent: LogoutControlComponent;
  canEditProfile: boolean;
  onProfileUpdated: () => Promise<void>;
}) {
  const data = useLoaderData() as MyPageRouteData;
  const [routeState, setRouteState] = useState({ source: data, routeData: data });
  const [pagination, setPagination] = useState<JourneyPaginationState>({ pendingCursor: null, failedCursor: null });
  const [settingsOpen, setSettingsOpen] = useState(false);
  const pendingCursorRef = useRef<string | null>(null);
  const routeData = routeDataForLoader(data, routeState.routeData, routeState.source);
  const { clubSlug } = useParams();
  const revalidator = useRevalidator();

  const submitProfileUpdate = useCallback(
    async (displayName: string): Promise<MemberProfileResponse> => {
      if (!canEditProfile) {
        throw new Error(profileSaveErrorMessage("MEMBERSHIP_NOT_ALLOWED"));
      }

      const response = await updateMyProfile(displayName);

      if (!response.ok) {
        throw new Error(profileSaveErrorMessage(await profileErrorCodeFromResponse(response)));
      }

      const profile = (await response.json()) as MemberProfileResponse;
      await onProfileUpdated();
      revalidator.revalidate();
      return profile;
    },
    [canEditProfile, onProfileUpdated, revalidator],
  );

  const loadJourneyPage = useCallback(
    async (cursor: string) => {
      if (pendingCursorRef.current === cursor) {
        return;
      }

      pendingCursorRef.current = cursor;
      setPagination({ pendingCursor: cursor, failedCursor: null });

      try {
        const nextPage = await fetchMyJourney(clubSlug ? { clubSlug } : undefined, { limit: 12, cursor });
        setRouteState((current) => {
          const currentData = routeDataForLoader(data, current.routeData, current.source);
          const nextJourney: MyJourneyPage = {
            ...currentData.journey,
            items: appendUniqueJourneyItems(currentData.journey.items, nextPage.items),
            nextCursor: nextPage.nextCursor,
          };

          return {
            source: data,
            routeData: { ...currentData, journey: nextJourney },
          };
        });
        setPagination({ pendingCursor: null, failedCursor: null });
      } catch {
        setPagination({ pendingCursor: null, failedCursor: cursor });
      } finally {
        pendingCursorRef.current = null;
      }
    },
    [clubSlug, data],
  );

  const loadMoreJourney = useCallback(async () => {
    const cursor = pagination.failedCursor ?? routeData.journey.nextCursor;

    if (!cursor || pagination.pendingCursor === cursor || pendingCursorRef.current === cursor) {
      return;
    }

    await loadJourneyPage(cursor);
  }, [loadJourneyPage, pagination.failedCursor, pagination.pendingCursor, routeData.journey.nextCursor]);

  return (
    <MyPage
      data={routeData.profile}
      journey={routeData.journey}
      LogoutButtonComponent={LogoutButtonComponent}
      onLeaveMembership={submitLeaveMembership}
      canEditProfile={canEditProfile}
      onUpdateProfile={submitProfileUpdate}
      notificationPreferences={routeData.notificationPreferences.status === "ready" ? routeData.notificationPreferences.preferences : undefined}
      onSaveNotificationPreferences={saveNotificationPreferences}
      canManageNotificationPreferences={routeData.notificationPreferences.status === "ready"}
      notificationPreferencesError={routeData.notificationPreferences.status === "error"}
      onRetryNotificationPreferences={() => revalidator.revalidate()}
      onLoadMoreJourney={loadMoreJourney}
      journeyPaginationPending={pagination.pendingCursor !== null}
      journeyPaginationError={pagination.failedCursor !== null}
      settingsOpen={settingsOpen}
      onSettingsOpenChange={setSettingsOpen}
    />
  );
}
