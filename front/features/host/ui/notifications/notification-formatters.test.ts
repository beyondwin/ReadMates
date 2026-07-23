import { describe, expect, it } from "vitest";
import { eventLabels, notificationSourceLabels } from "./notification-formatters";

describe("notification formatter labels", () => {
  it("distinguishes host-confirmed record updates from automatic and manual events", () => {
    expect(eventLabels.SESSION_RECORD_UPDATED).toBe("세션 기록 수정");
    expect(notificationSourceLabels.HOST_CONFIRMED).toBe("호스트 확인");
    expect(notificationSourceLabels.AUTOMATIC).toBe("자동");
    expect(notificationSourceLabels.MANUAL).toBe("수동");
  });
});
