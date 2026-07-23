import { describe, expect, it } from "vitest";
import {
  canConfirmHostAction,
  groupSessionRecordIssues,
  shouldBlockSessionRecordNavigation,
} from "./host-session-record-editor-model";

describe("host session record editor model", () => {
  it("keeps confirmation disabled until SEND or SKIP is selected", () => {
    expect(canConfirmHostAction({ decision: null, targetCount: 4 })).toBe(false);
    expect(canConfirmHostAction({ decision: "SKIP", targetCount: 4 })).toBe(true);
    expect(canConfirmHostAction({ decision: "SEND", targetCount: 4 })).toBe(true);
  });

  it("disables SEND when the current preview has no targets", () => {
    expect(canConfirmHostAction({ decision: "SEND", targetCount: 0 })).toBe(false);
    expect(canConfirmHostAction({ decision: "SKIP", targetCount: 0 })).toBe(true);
  });

  it("maps validation issue codes to editor sections", () => {
    expect(groupSessionRecordIssues([
      "PUBLICATION_SUMMARY_REQUIRED",
      "HIGHLIGHT_AUTHOR_REQUIRED",
      "ONE_LINE_REVIEW_TEXT_REQUIRED",
      "FEEDBACK_DOCUMENT_INVALID",
      "LIVE_REVISION_STALE",
    ])).toEqual({
      summary: ["PUBLICATION_SUMMARY_REQUIRED"],
      highlights: ["HIGHLIGHT_AUTHOR_REQUIRED"],
      reviews: ["ONE_LINE_REVIEW_TEXT_REQUIRED"],
      feedback: ["FEEDBACK_DOCUMENT_INVALID"],
      general: ["LIVE_REVISION_STALE"],
    });
  });

  it("blocks navigation while local edits are unresolved", () => {
    expect(shouldBlockSessionRecordNavigation("idle")).toBe(false);
    expect(shouldBlockSessionRecordNavigation("saved")).toBe(false);
    expect(shouldBlockSessionRecordNavigation("dirty")).toBe(true);
    expect(shouldBlockSessionRecordNavigation("saving")).toBe(true);
    expect(shouldBlockSessionRecordNavigation("error")).toBe(true);
    expect(shouldBlockSessionRecordNavigation("stale")).toBe(true);
  });
});
