import { describe, expect, it } from "vitest";
import { getSessionClosingBoardView, type SessionClosingStatusInput } from "./session-closing-model";

const baseStatus: SessionClosingStatusInput = {
  schema: "host.session_closing_status.v1",
  session: {
    sessionId: "11111111-1111-1111-1111-111111111111",
    sessionNumber: 7,
    bookTitle: "E2E Book",
    meetingDate: "2026-06-18",
    state: "CLOSED",
    recordVisibility: "PUBLIC",
  },
  overall: {
    state: "READY",
    label: "Ready",
    primaryAction: "SEND_NOTIFICATION",
  },
  checklist: [
    {
      id: "SESSION_CLOSED",
      state: "DONE",
      label: "Session closed",
      detail: "Closed",
      href: "/app/host/sessions/11111111-1111-1111-1111-111111111111/edit",
    },
    {
      id: "MEMBER_NOTIFICATION_SENT",
      state: "ACTION_REQUIRED",
      label: "Member notification",
      detail: "Pending",
      href: "/app/host/notifications",
    },
  ],
  evidence: {
    summaryPublished: true,
    highlightCount: 2,
    oneLinerCount: 1,
    feedbackDocumentState: "AVAILABLE",
    latestNotificationEvent: null,
    publicRecordHref: "/clubs/club-a/sessions/11111111-1111-1111-1111-111111111111",
    memberReflectionHref: "/clubs/club-a/app/sessions/11111111-1111-1111-1111-111111111111",
  },
};

describe("getSessionClosingBoardView", () => {
  it("builds primary action and surface cards without leaking internal details", () => {
    const view = getSessionClosingBoardView(baseStatus);

    expect(view.title).toBe("No.07 · E2E Book");
    expect(view.statusTone).toBe("accent");
    expect(view.primaryAction.label).toBe("Check member notifications");
    expect(view.surfaces.map((surface) => surface.id)).toEqual(["HOST", "MEMBER", "PUBLIC"]);
    expect(JSON.stringify(view)).not.toContain("member1@example.com");
    expect(JSON.stringify(view)).not.toContain("ADMIN_ROUTE");
  });

  it("marks blocked feedback as danger tone", () => {
    const view = getSessionClosingBoardView({
      ...baseStatus,
      overall: { state: "BLOCKED", label: "Blocked", primaryAction: "IMPORT_RECORDS" },
      evidence: { ...baseStatus.evidence, feedbackDocumentState: "INVALID" },
    });

    expect(view.statusTone).toBe("danger");
    expect(view.evidence.find((item) => item.label === "Feedback document")?.value).toBe("Needs review");
  });
});
