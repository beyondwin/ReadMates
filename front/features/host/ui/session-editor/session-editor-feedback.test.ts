import { describe, expect, it } from "vitest";
import { readmatesReturnState } from "@/shared/routing/readmates-route-state";
import { feedbackPreviewStateForSession } from "./session-editor-feedback";

describe("feedbackPreviewStateForSession", () => {
  it("preserves the scoped record owner behind the scoped session detail", () => {
    expect(feedbackPreviewStateForSession(
      { sessionId: "session-1" },
      {
        href: "/clubs/club-a/app/host/records",
        label: "기록으로",
      },
      readmatesReturnState,
      "club-a",
    )).toEqual({
      readmatesReturnTo: "/clubs/club-a/app/host/sessions/session-1",
      readmatesReturnLabel: "모임 문서로",
      readmatesReturnState: {
        readmatesReturnTo: "/clubs/club-a/app/host/records",
        readmatesReturnLabel: "기록으로",
      },
    });
  });
});
