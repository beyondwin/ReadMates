import type { QueryClient } from "@tanstack/react-query";
import type { LoaderFunctionArgs } from "react-router";
import type {
  HostClubOperationsResponse,
  HostNotificationSummary,
  HostOperatingRoomCurrentResponse,
  HostSessionClosingStatusResponse,
  HostSessionDetailResponse,
  HostSessionRecordLedgerPage,
} from "@/features/host/api/host-contracts";
import { requireHostClubContext } from "@/features/host/model/host-authority-loss";
import { hostClubOperationsQuery } from "@/features/host/queries/host-club-operations-queries";
import { hostNotificationHealthQuery } from "@/features/host/queries/host-notification-queries";
import { hostSessionRecordLedgerQuery } from "@/features/host/queries/host-session-record-queries";
import {
  hostOperatingRoomCurrentQuery,
  hostSessionClosingStatusQuery,
  hostSessionDetailQuery,
} from "@/features/host/queries/host-session-queries";
import { clubSlugFromLoaderArgs } from "@/shared/auth/member-app-loader";
import { requireHostLoaderAuth } from "./host-loader-auth";

export const HOST_HOME_ATTENTION_LIMIT = 7;

export type HostDashboardOptionalError = {
  message: string;
  retryable: true;
};

export type HostDashboardOptionalResult<T> =
  | { state: "ready"; data: T }
  | { state: "absent" }
  | { state: "failed"; error: HostDashboardOptionalError };

export type HostDashboardRouteData = {
  operatingRoom: HostOperatingRoomCurrentResponse;
  currentMeeting: HostSessionDetailResponse | null;
  closingStatus: HostDashboardOptionalResult<HostSessionClosingStatusResponse>;
  recordAttention: HostDashboardOptionalResult<HostSessionRecordLedgerPage>;
  clubOperations: HostDashboardOptionalResult<HostClubOperationsResponse>;
  notificationHealth: HostDashboardOptionalResult<HostNotificationSummary>;
};

export function preserveLocationSuffix(requestUrl: string, destination: string): string {
  const source = new URL(requestUrl);
  return `${destination}${source.search}${source.hash}`;
}

function absent<T>(): HostDashboardOptionalResult<T> {
  return { state: "absent" };
}

async function optionalResult<T>(
  request: Promise<T>,
  message: string,
): Promise<HostDashboardOptionalResult<T>> {
  try {
    return { state: "ready", data: await request };
  } catch {
    return {
      state: "failed",
      error: { message, retryable: true },
    };
  }
}

export function hostDashboardLoaderFactory(client: QueryClient) {
  return async (args?: LoaderFunctionArgs): Promise<HostDashboardRouteData> => {
    await requireHostLoaderAuth(args);
    const context = requireHostClubContext(clubSlugFromLoaderArgs(args));
    const operatingRoom = await client.fetchQuery(hostOperatingRoomCurrentQuery(context));
    const sessionId = operatingRoom.currentMeeting?.sessionId ?? null;

    if (!sessionId) {
      return {
        operatingRoom,
        currentMeeting: null,
        closingStatus: absent(),
        recordAttention: absent(),
        clubOperations: absent(),
        notificationHealth: absent(),
      };
    }

    const [currentMeeting, closingStatus, recordAttention, clubOperations, notificationHealth] =
      await Promise.all([
        client.fetchQuery(hostSessionDetailQuery(sessionId, context)),
        optionalResult(
          client.fetchQuery(hostSessionClosingStatusQuery(sessionId, context)),
          "마감 상태를 불러오지 못했습니다.",
        ),
        optionalResult(
          client.fetchQuery(hostSessionRecordLedgerQuery({
            needsAttention: true,
            page: { limit: HOST_HOME_ATTENTION_LIMIT },
          }, context)),
          "기록 확인 항목을 불러오지 못했습니다.",
        ),
        optionalResult(
          client.fetchQuery(hostClubOperationsQuery(context)),
          "클럽 운영 상태를 불러오지 못했습니다.",
        ),
        optionalResult(
          client.fetchQuery(hostNotificationHealthQuery(context)),
          "알림 상태를 불러오지 못했습니다.",
        ),
      ]);

    return {
      operatingRoom,
      currentMeeting,
      closingStatus,
      recordAttention,
      clubOperations,
      notificationHealth,
    };
  };
}
