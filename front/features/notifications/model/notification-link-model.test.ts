import { describe, expect, it } from "vitest";
import { getMemberNotificationLinkView } from "./notification-link-model";

describe("getMemberNotificationLinkView", () => {
  it("maps legacy session deep links to member reflection state", () => {
    expect(
      getMemberNotificationLinkView({
        eventType: "FEEDBACK_DOCUMENT_PUBLISHED",
        deepLinkPath: "/sessions/11111111-1111-1111-1111-111111111111",
      }),
    ).toEqual({
      href: "/app/sessions/11111111-1111-1111-1111-111111111111",
      state: {
        readmatesReturnTo: "/app/notifications",
        readmatesReturnLabel: "지난 모임 회고",
      },
    });
  });

  it("keeps club-scoped feedback links and attaches reflection return state", () => {
    expect(
      getMemberNotificationLinkView({
        eventType: "FEEDBACK_DOCUMENT_PUBLISHED",
        deepLinkPath: "/clubs/reading-sai/app/feedback/22222222-2222-2222-2222-222222222222",
      }),
    ).toEqual({
      href: "/clubs/reading-sai/app/feedback/22222222-2222-2222-2222-222222222222",
      state: {
        readmatesReturnTo: "/app/notifications",
        readmatesReturnLabel: "지난 모임 회고",
      },
    });
  });

  it("keeps destinations without reflection state minimal", () => {
    expect(
      getMemberNotificationLinkView({
        eventType: "SESSION_REMINDER_DUE",
        deepLinkPath: "/clubs/reading-sai/app/session/current",
      }),
    ).toEqual({
      href: "/clubs/reading-sai/app/session/current",
    });
  });

  it("normalizes notes paths without reflection state", () => {
    expect(
      getMemberNotificationLinkView({
        eventType: "REVIEW_PUBLISHED",
        deepLinkPath: "/notes?sessionId=11111111-1111-1111-1111-111111111111",
      }),
    ).toEqual({
      href: "/app/notes?sessionId=11111111-1111-1111-1111-111111111111",
    });
  });

  it("keeps unsafe destinations inside the notification inbox", () => {
    expect(
      getMemberNotificationLinkView({
        eventType: "FEEDBACK_DOCUMENT_PUBLISHED",
        deepLinkPath: "//evil.example.com",
      }),
    ).toEqual({ href: "/app/notifications" });

    expect(
      getMemberNotificationLinkView({
        eventType: "FEEDBACK_DOCUMENT_PUBLISHED",
        deepLinkPath: "https://evil.example.com",
      }),
    ).toEqual({ href: "/app/notifications" });
  });
});
