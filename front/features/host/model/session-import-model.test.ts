import { describe, expect, it } from "vitest";
import {
  buildSessionImportRequest,
  sessionImportCanCommit,
  sessionImportReplacementWarning,
} from "./session-import-model";
import type { SessionImportPreviewResponse } from "./host-view-types";

describe("session import model", () => {
  it("wraps generated import json with the selected editor visibility", () => {
    const request = buildSessionImportRequest(
      JSON.stringify({
        format: "readmates-session-import:v1",
        session: { number: 7, bookTitle: "Example Book", meetingDate: "2026-05-14" },
        publication: { summary: "Summary" },
        highlights: [{ authorName: "Host", text: "Highlight" }],
        oneLineReviews: [{ authorName: "Host", text: "One line" }],
        feedbackDocument: { fileName: "session-7.md", markdown: "<!-- readmates-feedback:v1 -->" },
      }),
      "MEMBER",
    );

    expect(request.recordVisibility).toBe("MEMBER");
    expect(request.format).toBe("readmates-session-import:v1");
    expect(request.highlights).toHaveLength(1);
  });

  it("rejects malformed json and missing format before preview", () => {
    expect(() => buildSessionImportRequest("{", "PUBLIC")).toThrow("JSON");
    expect(() => buildSessionImportRequest("{}", "PUBLIC")).toThrow("readmates-session-import:v1");
  });

  it("allows commit only for valid previews", () => {
    expect(sessionImportCanCommit(preview({ valid: true, issueCount: 0 }))).toBe(true);
    expect(sessionImportCanCommit(preview({ valid: false, issueCount: 1 }))).toBe(false);
  });

  it("describes the replacement scope in one warning", () => {
    expect(sessionImportReplacementWarning()).toContain("요약");
    expect(sessionImportReplacementWarning()).toContain("피드백 문서");
  });
});

function preview({ valid, issueCount }: { valid: boolean; issueCount: number }): SessionImportPreviewResponse {
  return {
    valid,
    session: { sessionNumber: 7, bookTitle: "Example Book", meetingDate: "2026-05-14" },
    publication: { summary: "Summary" },
    highlights: [],
    oneLineReviews: [],
    feedbackDocument: { fileName: "session-7.md", title: "독서모임 7차 피드백", valid },
    issues: Array.from({ length: issueCount }, (_, index) => ({
      code: `ISSUE_${index}`,
      message: "Issue",
    })),
  };
}
