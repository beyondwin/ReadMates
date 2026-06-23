import { describe, expect, it } from "vitest";
import { readFeedbackReturnTarget } from "./feedback-route-continuity";

describe("readFeedbackReturnTarget", () => {
  it("preserves notification reflection return target", () => {
    expect(
      readFeedbackReturnTarget({
        readmatesReturnTo: "/app/notifications",
        readmatesReturnLabel: "지난 모임 회고",
      }),
    ).toEqual({
      href: "/app/notifications",
      label: "지난 모임 회고",
    });
  });

  it("preserves club-scoped notification return target", () => {
    expect(
      readFeedbackReturnTarget({
        readmatesReturnTo: "/clubs/reading-sai/app/notifications",
        readmatesReturnLabel: "지난 모임 회고",
      }),
    ).toEqual({
      href: "/clubs/reading-sai/app/notifications",
      label: "지난 모임 회고",
    });
  });

  it("rejects unsafe return targets", () => {
    expect(
      readFeedbackReturnTarget({
        readmatesReturnTo: "https://evil.example.com/app/notifications",
        readmatesReturnLabel: "지난 모임 회고",
      }),
    ).toEqual({
      href: "/app/archive?view=report",
      label: "아카이브로 돌아가기",
    });
  });
});
