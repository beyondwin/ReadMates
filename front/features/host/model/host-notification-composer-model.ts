import type {
  HostNotificationEventType,
  ManualNotificationAudience,
  ManualNotificationRequestedChannels,
  ManualNotificationSelectionRequest,
} from "./host-view-types";

export type HostNotificationRecipientMode =
  | "RECOMMENDED"
  | ManualNotificationAudience;

export type HostNotificationComposerDraft = {
  sessionId: string;
  eventType: HostNotificationEventType;
  contentRevision: string;
  scheduleRevision: number;
  subject: string;
  body: string;
  recipientMode: HostNotificationRecipientMode;
  requestedChannels: ManualNotificationRequestedChannels;
  selectedMembershipIds: string[];
};

export function recommendedAudience(
  eventType: HostNotificationEventType,
): "ALL_ACTIVE_MEMBERS" | "CONFIRMED_ATTENDEES" {
  return eventType === "NEXT_BOOK_PUBLISHED"
    ? "ALL_ACTIVE_MEMBERS"
    : "CONFIRMED_ATTENDEES";
}

export function composerCanPreview(draft: HostNotificationComposerDraft): boolean {
  const copyIsValid = draft.subject.trim().length > 0
    && draft.subject.length <= 200
    && draft.body.trim().length > 0
    && draft.body.length <= 4_000;
  const audienceIsValid = draft.recipientMode !== "SELECTED_MEMBERS"
    || draft.selectedMembershipIds.length > 0;
  return copyIsValid && audienceIsValid;
}

export function buildComposerSelection(
  draft: HostNotificationComposerDraft,
): ManualNotificationSelectionRequest {
  const audience = draft.recipientMode === "RECOMMENDED"
    ? recommendedAudience(draft.eventType)
    : draft.recipientMode;
  return {
    sessionId: draft.sessionId,
    eventType: draft.eventType,
    contentRevision: draft.contentRevision,
    scheduleRevision: draft.scheduleRevision,
    subject: draft.subject,
    body: draft.body,
    audience,
    requestedChannels: draft.requestedChannels,
    selectedMembershipIds: draft.recipientMode === "SELECTED_MEMBERS"
      ? [...draft.selectedMembershipIds].sort()
      : [],
    excludedMembershipIds: [],
    includedMembershipIds: [],
    sendMode: "NOW",
  };
}
