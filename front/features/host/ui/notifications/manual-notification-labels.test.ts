import { describe, expect, it } from "vitest";
import {
  manualAudienceDescriptions,
  manualChannelDescriptions,
  manualSessionStateLabel,
  manualSessionVisibilityLabel,
  manualTemplateDescriptions,
} from "./manual-notification-labels";

describe("manual notification presentation copy", () => {
  it("explains notification templates in host language", () => {
    expect(manualTemplateDescriptions.SESSION_REMINDER_DUE)
      .toBe("일정과 참석 여부를 다시 안내합니다.");
    expect(manualTemplateDescriptions.NEXT_BOOK_PUBLISHED)
      .toBe("다음 모임에서 읽을 책을 안내합니다.");
    expect(manualTemplateDescriptions.FEEDBACK_DOCUMENT_PUBLISHED)
      .toBe("정리된 피드백 문서를 멤버에게 안내합니다.");
  });

  it("explains recipients and channels without implementation terms", () => {
    expect(manualAudienceDescriptions.ALL_ACTIVE_MEMBERS)
      .toBe("현재 모임에 참여 중인 활성 멤버 모두");
    expect(manualAudienceDescriptions.SELECTED_MEMBERS)
      .toBe("검색해 한 명 이상 직접 지정");
    expect(manualChannelDescriptions.BOTH)
      .toBe("가능한 두 채널 모두 사용");
  });

  it("never exposes known session enums", () => {
    expect(manualSessionStateLabel("OPEN")).toBe("진행 중");
    expect(manualSessionVisibilityLabel("HOST_ONLY")).toBe("호스트 전용");
    expect(manualSessionStateLabel("UNKNOWN")).toBe("상태 확인 필요");
    expect(manualSessionVisibilityLabel("UNKNOWN")).toBe("공개 범위 확인 필요");
  });
});
