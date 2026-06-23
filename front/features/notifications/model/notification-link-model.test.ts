import { describe, expect, it } from "vitest";
import { getMemberNotificationLinkView } from "./notification-link-model";

describe("getMemberNotificationLinkView", () => {
  it("maps legacy session deep links to member reflection action with return state", () => {
    const view = getMemberNotificationLinkView({
      eventType: "FEEDBACK_DOCUMENT_PUBLISHED",
      deepLinkPath: "/sessions/11111111-1111-1111-1111-111111111111",
    });

    expect(view.href).toBe("/app/sessions/11111111-1111-1111-1111-111111111111");
    expect(view.primaryActionLabel).toBe("View record");
    expect(view.reflectionLabel).toBe("Past session reflection");
    expect(view.state).toEqual({
      readmatesReturnTo: "/app/notifications",
      readmatesReturnLabel: "지난 모임 회고",
    });
  });

  it("keeps club-scoped feedback links and attaches reflection return state", () => {
    const view = getMemberNotificationLinkView({
      eventType: "FEEDBACK_DOCUMENT_PUBLISHED",
      deepLinkPath: "/clubs/reading-sai/app/feedback/22222222-2222-2222-2222-222222222222",
    });

    expect(view.href).toBe("/clubs/reading-sai/app/feedback/22222222-2222-2222-2222-222222222222");
    expect(view.primaryActionLabel).toBe("View feedback");
    expect(view.reflectionLabel).toBe("Past session reflection");
    expect(view.state).toEqual({
      readmatesReturnTo: "/app/notifications",
      readmatesReturnLabel: "지난 모임 회고",
    });
  });

  it("maps current-session and notes links without reflection state", () => {
    expect(
      getMemberNotificationLinkView({
        eventType: "SESSION_REMINDER_DUE",
        deepLinkPath: "/clubs/reading-sai/app/session/current",
      }),
    ).toEqual({
      href: "/clubs/reading-sai/app/session/current",
      primaryActionLabel: "Open",
      reflectionLabel: null,
    });

    expect(
      getMemberNotificationLinkView({
        eventType: "REVIEW_PUBLISHED",
        deepLinkPath: "/notes?sessionId=11111111-1111-1111-1111-111111111111",
      }),
    ).toEqual({
      href: "/app/notes?sessionId=11111111-1111-1111-1111-111111111111",
      primaryActionLabel: "Next reading",
      reflectionLabel: null,
    });
  });

  it("falls back for unsafe deep links", () => {
    expect(
      getMemberNotificationLinkView({
        eventType: "FEEDBACK_DOCUMENT_PUBLISHED",
        deepLinkPath: "//evil.example.com",
      }).href,
    ).toBe("/app/notifications");

    expect(
      getMemberNotificationLinkView({
        eventType: "FEEDBACK_DOCUMENT_PUBLISHED",
        deepLinkPath: "https://evil.example.com",
      }).href,
    ).toBe("/app/notifications");
  });
});
