import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  HostNotificationPolicyResponse,
  ManualNotificationDispatchListItem,
  ManualNotificationOptionsResponse,
} from "@/features/host/model/host-view-types";
import type { MeetingResponseLedgerRow } from "./meeting-response-ledger";
import {
  MeetingNotificationRail,
  nonResponderMembershipIds,
  type MeetingNotificationRailProps,
} from "./meeting-notification-rail";

afterEach(cleanup);

const contentRevision = "c".repeat(64);

const rows: MeetingResponseLedgerRow[] = [
  {
    membershipId: "m-going",
    displayName: "참석한 멤버",
    secondaryLabel: "going@example.com",
    response: "GOING",
    attendance: "UNKNOWN",
    attendanceRevision: 1,
    questionCount: null,
    recentResponseLabel: null,
  },
  {
    membershipId: "m-silent-1",
    displayName: "미응답 하나",
    secondaryLabel: "a@example.com",
    response: "NO_RESPONSE",
    attendance: "UNKNOWN",
    attendanceRevision: 1,
    questionCount: null,
    recentResponseLabel: null,
  },
  {
    membershipId: "m-silent-2",
    displayName: "미응답 둘",
    secondaryLabel: "b@example.com",
    response: "NO_RESPONSE",
    attendance: "UNKNOWN",
    attendanceRevision: 1,
    questionCount: null,
    recentResponseLabel: null,
  },
];

const policy: HostNotificationPolicyResponse = {
  sessionReminderEnabled: true,
  updatedAt: "2026-08-20T10:00:00+09:00",
};

const dispatches: ManualNotificationDispatchListItem[] = [
  {
    manualDispatchId: "dispatch-sent",
    eventId: "event-sent",
    source: "MANUAL",
    eventType: "SESSION_REMINDER_DUE",
    sessionId: "session-1",
    sessionNumber: 12,
    bookTitle: "예시 책",
    requestedChannels: "BOTH",
    audience: "ALL_ACTIVE_MEMBERS",
    resend: false,
    requestedBy: "host-1",
    targetCount: 14,
    expectedInAppCount: 14,
    expectedEmailCount: 10,
    eventStatus: "PUBLISHED",
    createdAt: "2026-08-18T09:00:00+09:00",
  },
  {
    manualDispatchId: "dispatch-pending",
    eventId: "event-pending",
    source: "MANUAL",
    eventType: "SESSION_REMINDER_DUE",
    sessionId: "session-1",
    sessionNumber: 12,
    bookTitle: "예시 책",
    requestedChannels: "BOTH",
    audience: "SELECTED_MEMBERS",
    resend: false,
    requestedBy: "host-1",
    targetCount: 2,
    expectedInAppCount: 2,
    expectedEmailCount: 1,
    eventStatus: "PENDING",
    createdAt: "2026-08-27T09:00:00+09:00",
  },
];

const options: ManualNotificationOptionsResponse = {
  session: {
    sessionId: "session-1",
    sessionNumber: 12,
    bookTitle: "예시 책",
    date: "2026-09-05",
    state: "OPEN",
    visibility: "MEMBER",
    feedbackDocumentUploaded: false,
  },
  templates: [{
    eventType: "SESSION_REMINDER_DUE",
    contentRevision,
    label: "모임 리마인더",
    enabled: true,
    disabledReason: null,
    defaultAudience: "SELECTED_MEMBERS",
    allowedAudiences: ["ALL_ACTIVE_MEMBERS", "CONFIRMED_ATTENDEES", "SELECTED_MEMBERS"],
    defaultChannels: "BOTH",
  }],
  members: {
    items: rows.map((row) => ({
      membershipId: row.membershipId,
      displayName: row.displayName,
      maskedEmail: row.secondaryLabel,
      role: "MEMBER",
      membershipStatus: "ACTIVE",
      sessionParticipationStatus: "ACTIVE",
      attendanceStatus: "UNKNOWN",
      emailEligibility: "ELIGIBLE",
      inAppEligibility: "ELIGIBLE",
    })),
    nextCursor: null,
  },
  recentDispatches: [],
};

const defaultProps: MeetingNotificationRailProps = {
  policy,
  policyPending: false,
  policyLoading: false,
  policyError: null,
  onPolicyChange: vi.fn().mockResolvedValue(undefined),
  dispatches,
  responseRows: rows,
  options,
  workbenchHref: "/app/host/notifications?sessionId=session-1&eventType=SESSION_REMINDER_DUE",
  busy: false,
  error: null,
  onSearch: vi.fn().mockResolvedValue(undefined),
  onLoadMore: vi.fn().mockResolvedValue(undefined),
  onPreview: vi.fn().mockResolvedValue(undefined),
  onConfirm: vi.fn().mockResolvedValue(undefined),
};

function renderRail(overrides: Partial<MeetingNotificationRailProps> = {}) {
  return render(<MeetingNotificationRail {...defaultProps} {...overrides} />);
}

describe("nonResponderMembershipIds", () => {
  it("returns only NO_RESPONSE membership ids", () => {
    expect(nonResponderMembershipIds(rows)).toEqual(["m-silent-1", "m-silent-2"]);
  });
});

describe("MeetingNotificationRail", () => {
  it("renders the sessionReminderEnabled policy toggle and sent/scheduled rows", () => {
    renderRail();

    const rail = screen.getByRole("region", { name: "자동 알림" });
    expect(within(rail).getByRole("switch", { name: "모임 전날 자동 리마인더" })).toBeChecked();
    expect(within(rail).getByText("발송됨")).toBeInTheDocument();
    expect(within(rail).getByText("예정")).toBeInTheDocument();
  });

  it("defaults the composer audience label to 미응답 N명", () => {
    renderRail();

    expect(screen.getByText("미응답 2명")).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /미응답 2명/ })).toBeChecked();
  });

  it("shows a 140-character counter and workbench link for long-form copy", async () => {
    const user = userEvent.setup();
    renderRail();

    expect(screen.getByText(/0\s*\/\s*140/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /알림 작업대/ })).toHaveAttribute(
      "href",
      defaultProps.workbenchHref,
    );

    await user.type(screen.getByRole("textbox", { name: "짧은 공지" }), "짧은 리마인드");
    expect(screen.getByText(/7\s*\/\s*140/)).toBeInTheDocument();
  });

  it("shows the confirmed-attendee nudge prohibition reason in reminder context", () => {
    renderRail();

    expect(
      screen.getByText(/참석 확정 멤버에게는 재촉 알림을 보내지 않습니다/),
    ).toBeInTheDocument();
  });
});
