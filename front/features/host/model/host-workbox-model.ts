import type {
  HostWorkItemType,
  HostWorkboxItem,
  HostWorkboxPage,
  HostWorkboxState,
  HostWorkSourceFailureCode,
} from "../api/host-workbox-contracts";

export type HostWorkboxDestinationCategory =
  | "schedule-review"
  | "people"
  | "records"
  | "invitation-settings"
  | "notifications";

const OPERATIONAL_LABELS = {
  SCHEDULE_UNSEEN: "일정 미열람 확인",
  MEMBER_APPROVAL: "가입 승인 검토",
  RECORD_CLOSING: "지난 모임 기록 마감",
  INVITATION_EXPIRY: "초대 링크 만료 확인",
  NOTIFICATION_FAILURE: "알림 실패 확인",
} as const satisfies Record<HostWorkItemType, string>;

const DESTINATION_CATEGORIES = {
  SCHEDULE_UNSEEN: "schedule-review",
  MEMBER_APPROVAL: "people",
  RECORD_CLOSING: "records",
  INVITATION_EXPIRY: "invitation-settings",
  NOTIFICATION_FAILURE: "notifications",
} as const satisfies Record<HostWorkItemType, HostWorkboxDestinationCategory>;

export type HostWorkboxItemView = HostWorkboxItem & {
  operationalLabel: string;
  destinationCategory: HostWorkboxDestinationCategory;
  countLabel: string;
};

export type HostWorkboxPartialWarning = {
  [Type in HostWorkItemType]: {
    type: Type;
    operationalLabel: (typeof OPERATIONAL_LABELS)[Type];
    failureCode: HostWorkSourceFailureCode;
    message: string;
  }
}[HostWorkItemType];

export type HostWorkboxView = {
  state: HostWorkboxState;
  evaluatedAt: string;
  items: HostWorkboxItemView[];
  partialWarnings: HostWorkboxPartialWarning[];
  nextCursor: string | null;
};

export function buildHostWorkboxView(page: HostWorkboxPage): HostWorkboxView {
  return {
    state: page.state,
    evaluatedAt: page.evaluatedAt,
    items: page.items.map((item) => ({
      ...item,
      operationalLabel: OPERATIONAL_LABELS[item.type],
      destinationCategory: DESTINATION_CATEGORIES[item.type],
      destinationHref: item.destinationHref,
      count: item.count,
      countLabel: String(item.count),
      receiptSummary: item.receiptSummary,
    })),
    partialWarnings: page.sourceAvailability.flatMap((source) => {
      if (source.state === "AVAILABLE") return [];
      const operationalLabel = OPERATIONAL_LABELS[source.type];
      return [{
        type: source.type,
        operationalLabel,
        failureCode: source.failureCode,
        message: `${operationalLabel} 정보를 불러오지 못했어요.`,
      } as HostWorkboxPartialWarning];
    }),
    nextCursor: page.nextCursor,
  };
}
