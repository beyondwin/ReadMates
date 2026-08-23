import { describe, expect, it } from "vitest";
import { readFeedbackReturnTarget } from "./feedback-route-continuity";

describe("readFeedbackReturnTarget", () => {
  it("preserves notification reflection return target", () => {
    expect(
      readFeedbackReturnTarget({
        readmatesReturnTo: "/app/notifications",
        readmatesReturnLabel: "지난 모임 회고",
      }, "/app/feedback/session-1"),
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
      }, "/clubs/reading-sai/app/feedback/session-1"),
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
      }, "/app/feedback/session-1"),
    ).toEqual({
      href: "/app/archive?view=report",
      label: "아카이브로 돌아가기",
    });
  });

  it("preserves a scoped detail-to-records return chain for the current club", () => {
    expect(readFeedbackReturnTarget({
      readmatesReturnTo: "/clubs/club-a/app/host/sessions/session-1",
      readmatesReturnLabel: "모임 문서로",
      readmatesReturnState: {
        readmatesReturnTo: "/clubs/club-a/app/host/records",
        readmatesReturnLabel: "기록으로",
      },
    }, "/clubs/club-a/app/host/sessions/session-1/feedback-document")).toEqual({
      href: "/clubs/club-a/app/host/sessions/session-1",
      label: "모임 문서로",
      state: {
        readmatesReturnTo: "/clubs/club-a/app/host/records",
        readmatesReturnLabel: "기록으로",
      },
    });
  });

  it.each([
    ["another club", "/clubs/club-b/app/host/sessions/session-1"],
    ["an external origin", "https://evil.example.com/clubs/club-a/app/host/sessions/session-1"],
  ])("falls back instead of adopting %s", (_label, readmatesReturnTo) => {
    expect(readFeedbackReturnTarget({
      readmatesReturnTo,
      readmatesReturnLabel: "모임 문서로",
    }, "/clubs/club-a/app/host/sessions/session-1/feedback-document")).toEqual({
      href: "/app/archive?view=report",
      label: "아카이브로 돌아가기",
    });
  });

  it("scopes an unscoped compatibility chain into the current club", () => {
    expect(readFeedbackReturnTarget({
      readmatesReturnTo: "/app/sessions/session-1#feedback",
      readmatesReturnLabel: "모임으로 돌아가기",
      readmatesReturnState: {
        readmatesReturnTo: "/app/archive?view=reviews",
        readmatesReturnLabel: "아카이브로",
      },
    }, "/clubs/club-a/app/feedback/session-1")).toEqual({
      href: "/clubs/club-a/app/sessions/session-1#feedback",
      label: "모임으로 돌아가기",
      state: {
        readmatesReturnTo: "/clubs/club-a/app/archive?view=reviews",
        readmatesReturnLabel: "아카이브로",
      },
    });
  });

  it("falls back without overflowing on cyclic state", () => {
    const cyclic: Record<string, unknown> = {
      readmatesReturnTo: "/clubs/club-a/app/host/sessions/session-1",
      readmatesReturnLabel: "모임 문서로",
    };
    cyclic.readmatesReturnState = cyclic;

    expect(readFeedbackReturnTarget(
      cyclic,
      "/clubs/club-a/app/host/sessions/session-1/feedback-document",
    )).toEqual({
      href: "/app/archive?view=report",
      label: "아카이브로 돌아가기",
    });
  });

  it("falls back when nested return state exceeds the depth limit", () => {
    let nested: unknown = {
      readmatesReturnTo: "/clubs/club-a/app/host/records",
      readmatesReturnLabel: "기록으로",
    };
    for (let index = 0; index < 10; index += 1) {
      nested = {
        readmatesReturnTo: `/clubs/club-a/app/host/sessions/session-${index}`,
        readmatesReturnLabel: "모임 문서로",
        readmatesReturnState: nested,
      };
    }

    expect(readFeedbackReturnTarget(
      nested,
      "/clubs/club-a/app/host/sessions/session-1/feedback-document",
    )).toEqual({
      href: "/app/archive?view=report",
      label: "아카이브로 돌아가기",
    });
  });
});
