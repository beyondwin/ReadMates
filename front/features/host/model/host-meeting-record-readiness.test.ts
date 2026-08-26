import { describe, expect, it } from "vitest";
import type { HostSessionRecordEditor } from "@/features/host/api/host-session-record-contracts";
import {
  mapHostMeetingRecordFacts,
  type HostMeetingRecordFacts,
} from "./host-meeting-record-readiness";

const emptySnapshot: HostSessionRecordEditor["liveSnapshot"] = {
  schema: "readmates-session-record:v1",
  visibility: "MEMBER",
  publicationSummary: "legacy snapshot text is not a new API field",
  highlights: [{ membershipId: "member-1", authorDisplayName: "Host", text: "highlight" }],
  oneLineReviews: [],
  feedbackDocument: { fileName: "notes.md", title: "Notes", markdown: "body" },
};

function editor(
  overrides: Partial<Pick<
    HostSessionRecordEditor,
    "draft" | "draftLiveBaseStale" | "liveRevision" | "validationSummary"
  >> = {},
): HostSessionRecordEditor {
  return {
    sessionId: "session-1",
    liveRevision: 0,
    liveSessionUpdatedAt: "2026-08-21T00:00:00.000Z",
    liveSnapshot: emptySnapshot,
    draft: null,
    draftLiveBaseStale: false,
    validationSummary: { valid: true, issues: [] },
    ...overrides,
  };
}

function draft(overrides: Partial<NonNullable<HostSessionRecordEditor["draft"]>> = {}): NonNullable<HostSessionRecordEditor["draft"]> {
  return {
    sessionId: "session-1",
    baseLiveRevision: 0,
    draftRevision: 1,
    source: "MANUAL",
    restoredFromRevisionId: null,
    snapshot: emptySnapshot,
    updatedAt: "2026-08-21T01:00:00.000Z",
    ...overrides,
  };
}

describe("mapHostMeetingRecordFacts", () => {
  it("maps draft absence, liveRevision 0, and publication unreadiness from the editor", () => {
    expect(mapHostMeetingRecordFacts(editor())).toEqual({
      hasDraft: false,
      draftLiveBaseStale: false,
      validationIssueCount: 0,
      hasAppliedRecord: false,
      publicationReady: false,
    } satisfies HostMeetingRecordFacts);
  });

  it("maps draft presence without inventing a new API field", () => {
    expect(mapHostMeetingRecordFacts(editor({ draft: draft() })).hasDraft).toBe(true);
  });

  it("maps draftLiveBaseStale from the editor", () => {
    expect(mapHostMeetingRecordFacts(editor({
      liveRevision: 2,
      draft: draft(),
      draftLiveBaseStale: true,
    }))).toMatchObject({
      hasDraft: true,
      draftLiveBaseStale: true,
      hasAppliedRecord: true,
      publicationReady: false,
    });
  });

  it("maps validation issue count from validationSummary.issues", () => {
    expect(mapHostMeetingRecordFacts(editor({
      liveRevision: 1,
      draft: draft(),
      validationSummary: {
        valid: false,
        issues: ["PUBLICATION_SUMMARY_REQUIRED", "HIGHLIGHT_AUTHOR_REQUIRED"],
      },
    }))).toMatchObject({
      validationIssueCount: 2,
      hasAppliedRecord: true,
      publicationReady: false,
    });
  });

  it("treats liveRevision > 0 as the applied-record fact", () => {
    expect(mapHostMeetingRecordFacts(editor({ liveRevision: 1 }))).toMatchObject({
      hasAppliedRecord: true,
      publicationReady: true,
    });
    expect(mapHostMeetingRecordFacts(editor({ liveRevision: 0 })).hasAppliedRecord).toBe(false);
  });

  it("does not treat liveSnapshot content as applied when liveRevision is 0", () => {
    expect(mapHostMeetingRecordFacts(editor({ liveRevision: 0 })).hasAppliedRecord).toBe(false);
  });

  it("is publication-ready only with an applied revision, a fresh base, and a valid summary", () => {
    expect(mapHostMeetingRecordFacts(editor({
      liveRevision: 3,
      draftLiveBaseStale: false,
      validationSummary: { valid: true, issues: [] },
    })).publicationReady).toBe(true);

    expect(mapHostMeetingRecordFacts(editor({
      liveRevision: 3,
      draftLiveBaseStale: true,
      validationSummary: { valid: true, issues: [] },
    })).publicationReady).toBe(false);

    expect(mapHostMeetingRecordFacts(editor({
      liveRevision: 3,
      validationSummary: { valid: false, issues: ["PUBLICATION_SUMMARY_REQUIRED"] },
    })).publicationReady).toBe(false);
  });

  it("returns only the five existing editor facts", () => {
    expect(Object.keys(mapHostMeetingRecordFacts(editor({ liveRevision: 1 }))).sort()).toEqual([
      "draftLiveBaseStale",
      "hasAppliedRecord",
      "hasDraft",
      "publicationReady",
      "validationIssueCount",
    ]);
  });
});
