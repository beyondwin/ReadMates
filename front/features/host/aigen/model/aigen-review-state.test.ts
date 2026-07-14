import { describe, expect, it } from "vitest";
import type { SessionImportV1Snapshot } from "@/features/host/aigen/api/aigen-contracts";
import {
  REVIEW_SECTIONS,
  applySectionEdit,
  confirmEditedSection,
  createReviewState,
  isSectionChanged,
  markGroundedReviewed,
  resetReviewStateForRevision,
  selectEvidenceTarget,
  toCommitSectionReviews,
} from "./aigen-review-state";

function serverSnapshot(): SessionImportV1Snapshot {
  return {
    format: "readmates.session.v1",
    sessionNumber: 12,
    bookTitle: "공개 테스트 도서",
    meetingDate: "2026-07-14",
    summary: "첫 문단입니다.\n\n둘째 문단입니다.",
    highlights: [
      { authorName: "테스트독자A", text: "첫 하이라이트" },
      { authorName: "테스트독자B", text: "둘째 하이라이트" },
    ],
    oneLineReviews: [
      { authorName: "테스트독자A", text: "첫 한줄평" },
      { authorName: "테스트독자B", text: "둘째 한줄평" },
    ],
    feedbackDocumentFileName: "session-12-feedback.md",
    feedbackDocumentMarkdown: "# 첫 항목\n\n내용 A\n\n# 둘째 항목\n\n내용 B",
  };
}

const sectionTargets = {
  SUMMARY: ["summary:0", "summary:1"],
  HIGHLIGHTS: ["highlight:0", "highlight:1"],
  ONE_LINE_REVIEWS: ["one-line:0", "one-line:1"],
  FEEDBACK_DOCUMENT: ["feedback:0", "feedback:1"],
} as const;

describe("AI generation review state", () => {
  it("starts every new revision with exactly four pending sections", () => {
    const state = createReviewState(3);

    expect(state.revision).toBe(3);
    expect(state.sectionReviews).toEqual({
      SUMMARY: "PENDING",
      HIGHLIGHTS: "PENDING",
      ONE_LINE_REVIEWS: "PENDING",
      FEEDBACK_DOCUMENT: "PENDING",
    });
    expect(Object.keys(state.sectionReviews)).toEqual(REVIEW_SECTIONS);
    expect(state.invalidatedTargetIds).toEqual([]);
    expect(state.selectedTargetId).toBeNull();
  });

  it("allows an unchanged section to be explicitly grounded-reviewed", () => {
    const snapshot = serverSnapshot();
    const state = markGroundedReviewed(
      createReviewState(1),
      "SUMMARY",
      snapshot,
      structuredClone(snapshot),
    );

    expect(state.sectionReviews.SUMMARY).toBe("AI_GROUNDED_REVIEWED");
  });

  it("makes the first targeted edit require review, invalidates only its target, and clears its selection", () => {
    const snapshot = serverSnapshot();
    const draft = structuredClone(snapshot);
    draft.highlights[0] = { ...draft.highlights[0], text: "호스트가 수정한 하이라이트" };
    const selected = selectEvidenceTarget(createReviewState(1), "highlight:0");

    const state = applySectionEdit(selected, {
      section: "HIGHLIGHTS",
      serverSnapshot: snapshot,
      draft,
      sectionTargetIds: sectionTargets.HIGHLIGHTS,
      changedTargetIds: ["highlight:0"],
    });

    expect(state.sectionReviews.HIGHLIGHTS).toBe("USER_EDITED_REVIEW_REQUIRED");
    expect(state.invalidatedTargetIds).toEqual(["highlight:0"]);
    expect(state.selectedTargetId).toBeNull();
  });

  it("preserves unchanged sibling evidence for targeted highlight and one-line edits", () => {
    const snapshot = serverSnapshot();
    const highlightDraft = structuredClone(snapshot);
    highlightDraft.highlights[0] = { ...highlightDraft.highlights[0], text: "수정된 첫 항목" };
    const afterHighlight = applySectionEdit(createReviewState(1), {
      section: "HIGHLIGHTS",
      serverSnapshot: snapshot,
      draft: highlightDraft,
      sectionTargetIds: sectionTargets.HIGHLIGHTS,
      changedTargetIds: ["highlight:0"],
    });

    const oneLineDraft = structuredClone(snapshot);
    oneLineDraft.oneLineReviews[1] = { ...oneLineDraft.oneLineReviews[1], text: "수정된 둘째 항목" };
    const afterOneLine = applySectionEdit(afterHighlight, {
      section: "ONE_LINE_REVIEWS",
      serverSnapshot: snapshot,
      draft: oneLineDraft,
      sectionTargetIds: sectionTargets.ONE_LINE_REVIEWS,
      changedTargetIds: ["one-line:1"],
    });

    expect(afterOneLine.invalidatedTargetIds).toEqual(["highlight:0", "one-line:1"]);
    expect(afterOneLine.invalidatedTargetIds).not.toContain("highlight:1");
    expect(afterOneLine.invalidatedTargetIds).not.toContain("one-line:0");
  });

  it.each([
    ["SUMMARY", sectionTargets.SUMMARY, "summary:0"],
    ["FEEDBACK_DOCUMENT", sectionTargets.FEEDBACK_DOCUMENT, "feedback:0"],
  ] as const)("invalidates every %s target when structural mapping is ambiguous", (section, targets, selectedTarget) => {
    const snapshot = serverSnapshot();
    const draft = structuredClone(snapshot);
    if (section === "SUMMARY") {
      draft.summary = "문단 순서를 판별할 수 없게 다시 작성했습니다.";
    } else {
      draft.feedbackDocumentMarkdown = "구조를 판별할 수 없게 다시 작성했습니다.";
    }

    const state = applySectionEdit(selectEvidenceTarget(createReviewState(1), selectedTarget), {
      section,
      serverSnapshot: snapshot,
      draft,
      sectionTargetIds: targets,
      changedTargetIds: [],
      mappingAmbiguous: true,
    });

    expect(state.invalidatedTargetIds).toEqual([...targets]);
    expect(state.selectedTargetId).toBeNull();
  });

  it("requires an explicit confirmation before an edited section can be committed", () => {
    const snapshot = serverSnapshot();
    const draft = structuredClone(snapshot);
    draft.summary = "호스트가 직접 수정한 요약";
    const edited = applySectionEdit(createReviewState(1), {
      section: "SUMMARY",
      serverSnapshot: snapshot,
      draft,
      sectionTargetIds: sectionTargets.SUMMARY,
      changedTargetIds: ["summary:0"],
    });

    const confirmed = confirmEditedSection(edited, "SUMMARY", snapshot, draft);

    expect(edited.sectionReviews.SUMMARY).toBe("USER_EDITED_REVIEW_REQUIRED");
    expect(confirmed.sectionReviews.SUMMARY).toBe("USER_EDITED_CONFIRMED");
  });

  it("returns a byte-for-byte reverted section to pending instead of restoring review", () => {
    const snapshot = serverSnapshot();
    const editedDraft = structuredClone(snapshot);
    editedDraft.highlights[0] = { ...editedDraft.highlights[0], text: "임시 수정" };
    const edited = applySectionEdit(createReviewState(1), {
      section: "HIGHLIGHTS",
      serverSnapshot: snapshot,
      draft: editedDraft,
      sectionTargetIds: sectionTargets.HIGHLIGHTS,
      changedTargetIds: ["highlight:0"],
    });
    const confirmed = confirmEditedSection(edited, "HIGHLIGHTS", snapshot, editedDraft);

    const reverted = applySectionEdit(confirmed, {
      section: "HIGHLIGHTS",
      serverSnapshot: snapshot,
      draft: structuredClone(snapshot),
      sectionTargetIds: sectionTargets.HIGHLIGHTS,
      changedTargetIds: [],
    });

    expect(reverted.sectionReviews.HIGHLIGHTS).toBe("PENDING");
    expect(reverted.invalidatedTargetIds).toEqual([]);
  });

  it("resets every section, selection, and invalidation when regeneration changes revision", () => {
    const snapshot = serverSnapshot();
    const draft = structuredClone(snapshot);
    draft.oneLineReviews[0] = { ...draft.oneLineReviews[0], text: "수정" };
    const edited = applySectionEdit(selectEvidenceTarget(createReviewState(4), "one-line:0"), {
      section: "ONE_LINE_REVIEWS",
      serverSnapshot: snapshot,
      draft,
      sectionTargetIds: sectionTargets.ONE_LINE_REVIEWS,
      changedTargetIds: ["one-line:0"],
    });

    expect(resetReviewStateForRevision(edited, 5)).toEqual(createReviewState(5));
  });

  it("compares canonical section fields structurally without object identity or author normalization", () => {
    const snapshot = serverSnapshot();
    const equalClone = structuredClone(snapshot);
    equalClone.bookTitle = "이 섹션과 무관한 변경";

    expect(isSectionChanged(snapshot, equalClone, "HIGHLIGHTS")).toBe(false);

    const exactNameDraft = structuredClone(snapshot);
    exactNameDraft.highlights[0] = { ...exactNameDraft.highlights[0], authorName: " 테스트독자A " };
    expect(isSectionChanged(snapshot, exactNameDraft, "HIGHLIGHTS")).toBe(true);

    const reorderedDraft = structuredClone(snapshot);
    reorderedDraft.oneLineReviews.reverse();
    expect(isSectionChanged(snapshot, reorderedDraft, "ONE_LINE_REVIEWS")).toBe(true);
  });

  it("builds a commit review map with exactly the four server enum keys", () => {
    const snapshot = serverSnapshot();
    let state = createReviewState(1);
    for (const section of REVIEW_SECTIONS) {
      state = markGroundedReviewed(state, section, snapshot, structuredClone(snapshot));
    }

    const payload = toCommitSectionReviews(state, snapshot, structuredClone(snapshot));

    expect(payload).toEqual({
      SUMMARY: "AI_GROUNDED_REVIEWED",
      HIGHLIGHTS: "AI_GROUNDED_REVIEWED",
      ONE_LINE_REVIEWS: "AI_GROUNDED_REVIEWED",
      FEEDBACK_DOCUMENT: "AI_GROUNDED_REVIEWED",
    });
    expect(Object.keys(payload ?? {})).toEqual(REVIEW_SECTIONS);
  });

  it("refuses a commit map until unchanged and edited sections have the required explicit states", () => {
    const snapshot = serverSnapshot();
    const draft = structuredClone(snapshot);
    draft.feedbackDocumentMarkdown = "호스트가 확인할 수정 문서";
    let state = createReviewState(1);
    for (const section of REVIEW_SECTIONS.filter((value) => value !== "FEEDBACK_DOCUMENT")) {
      state = markGroundedReviewed(state, section, snapshot, draft);
    }
    state = applySectionEdit(state, {
      section: "FEEDBACK_DOCUMENT",
      serverSnapshot: snapshot,
      draft,
      sectionTargetIds: sectionTargets.FEEDBACK_DOCUMENT,
      changedTargetIds: ["feedback:0"],
    });

    expect(toCommitSectionReviews(state, snapshot, draft)).toBeNull();

    state = confirmEditedSection(state, "FEEDBACK_DOCUMENT", snapshot, draft);
    expect(toCommitSectionReviews(state, snapshot, draft)?.FEEDBACK_DOCUMENT).toBe("USER_EDITED_CONFIRMED");
  });
});
