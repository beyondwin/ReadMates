import { describe, expect, it } from "vitest";
import {
  defaultNotificationPreferences,
  notificationEventLabels,
  notificationEventOrder,
  notificationPreferenceAvailability,
} from "./notification-preferences-model";

describe("notification preferences model", () => {
  it("keeps the existing event order, Korean labels, and defaults", () => {
    expect(notificationEventOrder).toEqual([
      "NEXT_BOOK_PUBLISHED",
      "SESSION_REMINDER_DUE",
      "FEEDBACK_DOCUMENT_PUBLISHED",
      "REVIEW_PUBLISHED",
    ]);
    expect(notificationEventLabels).toEqual({
      NEXT_BOOK_PUBLISHED: { label: "다음 책 공개", sub: "예정 세션이 멤버에게 열릴 때" },
      SESSION_REMINDER_DUE: { label: "모임 전날 리마인더", sub: "모임 하루 전 준비 알림" },
      FEEDBACK_DOCUMENT_PUBLISHED: { label: "피드백 문서 등록", sub: "참석 회차의 피드백 문서가 올라올 때" },
      REVIEW_PUBLISHED: { label: "다른 멤버의 서평 공개", sub: "발행된 회차에 새 공개 서평이 올라올 때" },
    });
    expect(defaultNotificationPreferences).toEqual({
      emailEnabled: true,
      events: {
        NEXT_BOOK_PUBLISHED: true,
        SESSION_REMINDER_DUE: true,
        FEEDBACK_DOCUMENT_PUBLISHED: true,
        REVIEW_PUBLISHED: false,
      },
    });
  });

  it("makes viewer preferences unavailable without excluding writable member states", () => {
    expect(notificationPreferenceAvailability("VIEWER")).toBe("unavailable");
    expect(notificationPreferenceAvailability("ACTIVE")).toBe("ready");
    expect(notificationPreferenceAvailability("SUSPENDED")).toBe("ready");
  });
});
