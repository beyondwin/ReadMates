import type {
  HostWorkItemType,
  HostWorkboxItem,
  HostWorkboxPage,
  HostWorkboxState,
  HostWorkSourceFailureCode,
} from "../api/host-workbox-contracts";

export type { HostWorkItemType };

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

export type HostWorkboxDisclosure = {
  visibleItems: HostWorkboxItemView[];
  hiddenCount: number;
  hasMore: boolean;
  expanded: boolean;
};

const DESTINATION_OWNED_DEFERRAL = new Set<HostWorkboxDestinationCategory>([
  "schedule-review",
  "records",
]);

export function workboxOwnsDeferral(item: HostWorkboxItemView): boolean {
  if (item.state === "DEFERRED") return true;
  if (item.state !== "NOW") return false;
  return !DESTINATION_OWNED_DEFERRAL.has(item.destinationCategory);
}

export function buildHostWorkboxDisclosure(
  view: HostWorkboxView,
  options: { limit: 3 | 4; expanded: boolean },
): HostWorkboxDisclosure {
  const visibleItems = options.expanded ? view.items : view.items.slice(0, options.limit);
  return {
    visibleItems,
    hiddenCount: Math.max(0, view.items.length - visibleItems.length),
    hasMore: visibleItems.length < view.items.length || view.nextCursor !== null,
    expanded: options.expanded,
  };
}

export type HostWorkboxFooterNote = {
  text: string;
  historyHref: string;
};

export function buildWorkboxFooterNote(
  items: readonly HostWorkboxItemView[],
  now: Date = new Date(),
): string | null {
  const latest = items.reduce<HostWorkboxItemView | null>((current, item) => {
    if (!item.resolvedAt || !item.receiptSummary) return current;
    if (!current?.resolvedAt) return item;
    return new Date(item.resolvedAt).getTime() > new Date(current.resolvedAt).getTime() ? item : current;
  }, null);
  if (!latest?.resolvedAt || !latest.receiptSummary) return null;
  return `${formatReceiptWhen(latest.resolvedAt, now)} ${receiptOperationCopy(latest.receiptSummary.operation)}`;
}

function formatReceiptWhen(value: string, now: Date): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const time = new Intl.DateTimeFormat("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(date);
  const startOfNow = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startOfDate = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const dayDiff = Math.round((startOfNow - startOfDate) / 86_400_000);
  if (dayDiff === 0) return `오늘 ${time}`;
  if (dayDiff === 1) return `어제 ${time}`;
  return `${new Intl.DateTimeFormat("ko-KR", { month: "numeric", day: "numeric" }).format(date)} ${time}`;
}

function receiptOperationCopy(operation: string): string {
  if (operation === "SCHEDULE_REMINDER") return "자동 리마인드 전달됨";
  if (operation === "APPROVED") return "가입 승인 처리됨";
  return "작업 결과 기록됨";
}

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
