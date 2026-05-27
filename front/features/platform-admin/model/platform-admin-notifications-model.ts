export type AdminNotificationStatusSummary = {
  pending: number;
  active: number;
  failed: number;
  dead: number;
  sentOrPublishedLast24h: number;
};

export type AdminNotificationClubRef = {
  clubId: string;
  slug: string;
  name: string;
};

export type AdminNotificationOperationsSnapshot = {
  generatedAt: string;
  outboxSummary: AdminNotificationStatusSummary;
  deliverySummary: AdminNotificationStatusSummary;
  relaySummary: {
    publishing: number;
    sending: number;
    stalePublishing: number;
    staleSending: number;
  };
  failureClusters: Array<{
    safeErrorCode: string;
    status: string;
    count: number;
    latestAt: string | null;
  }>;
  clubHealth: Array<{
    clubId: string;
    slug: string;
    name: string;
    pending: number;
    failed: number;
    dead: number;
    lastSuccessAt: string | null;
  }>;
  recentManualDispatches: Array<{
    manualDispatchId: string;
    eventId: string;
    clubId: string;
    clubName: string;
    eventType: string;
    eventStatus: string;
    targetCount: number;
    createdAt: string;
  }>;
};

export type AdminNotificationOutboxEvent = {
  eventId: string;
  club: AdminNotificationClubRef;
  eventType: string;
  source: "AUTOMATIC" | "MANUAL";
  status: string;
  attemptCount: number;
  nextAttemptAt: string | null;
  createdAt: string;
  updatedAt: string;
  safeErrorCode: string | null;
  manualDispatch: null | {
    manualDispatchId: string;
    requestedBy: string;
    targetCount: number;
  };
};

export type AdminNotificationDelivery = {
  deliveryId: string;
  eventId: string;
  club: AdminNotificationClubRef;
  channel: "EMAIL" | "IN_APP";
  status: string;
  maskedRecipient: string | null;
  attemptCount: number;
  createdAt: string;
  updatedAt: string;
  safeErrorCode: string | null;
};

export type AdminNotificationReplayPreview = {
  previewId: string;
  selectionHash: string;
  matchedCount: number;
  excludedCount: number;
  estimatedByStatus: Record<string, number>;
  warnings: string[];
  expiresAt: string;
};

export type AdminNotificationFilters = {
  clubId?: string;
  eventStatus?: string;
  deliveryStatus?: string;
  channel?: "EMAIL" | "IN_APP";
  cursor?: string;
};

export type AdminNotificationReplayFilter = {
  clubId?: string;
  deliveryStatus?: string;
  channel?: "EMAIL" | "IN_APP";
};

export type AdminNotificationReplayConfirmRequest = {
  previewId: string;
  selectionHash: string;
  reason: string;
};

export type AdminNotificationReplayConfirmResult = {
  replayedCount: number;
  skippedCount: number;
  selectionHash: string;
};
