import type {
  ReviewSection,
  ServerSectionReviewStatus,
  SessionImportAuthoredText,
  SessionImportV1Snapshot,
} from "@/features/host/aigen/api/aigen-contracts";

export const REVIEW_SECTIONS = [
  "SUMMARY",
  "HIGHLIGHTS",
  "ONE_LINE_REVIEWS",
  "FEEDBACK_DOCUMENT",
] as const satisfies readonly ReviewSection[];

export type SectionReviewState =
  | "PENDING"
  | "AI_GROUNDED_REVIEWED"
  | "USER_EDITED_REVIEW_REQUIRED"
  | "USER_EDITED_CONFIRMED";

export type AiGenerationReviewState = {
  revision: number;
  sectionReviews: Record<ReviewSection, SectionReviewState>;
  selectedTargetId: string | null;
  invalidatedTargetIds: string[];
};

export type SectionEdit = {
  section: ReviewSection;
  serverSnapshot: SessionImportV1Snapshot;
  draft: SessionImportV1Snapshot;
  /** Every server-owned evidence target currently mapped to this section. */
  sectionTargetIds: readonly string[];
  /** Targets whose stable block changed while the section structure remained mappable. */
  changedTargetIds: readonly string[];
  /** Fail closed when paragraph or document-section ordinals can no longer be mapped. */
  mappingAmbiguous?: boolean;
};

function pendingSectionReviews(): Record<ReviewSection, SectionReviewState> {
  return {
    SUMMARY: "PENDING",
    HIGHLIGHTS: "PENDING",
    ONE_LINE_REVIEWS: "PENDING",
    FEEDBACK_DOCUMENT: "PENDING",
  };
}

export function createReviewState(revision: number): AiGenerationReviewState {
  return {
    revision,
    sectionReviews: pendingSectionReviews(),
    selectedTargetId: null,
    invalidatedTargetIds: [],
  };
}

export function resetReviewStateForRevision(
  _state: AiGenerationReviewState,
  revision: number,
): AiGenerationReviewState {
  return createReviewState(revision);
}

export function sectionValue(
  result: SessionImportV1Snapshot,
  section: ReviewSection,
): unknown {
  switch (section) {
    case "SUMMARY":
      return result.summary;
    case "HIGHLIGHTS":
      return result.highlights;
    case "ONE_LINE_REVIEWS":
      return result.oneLineReviews;
    case "FEEDBACK_DOCUMENT":
      return {
        fileName: result.feedbackDocumentFileName,
        markdown: result.feedbackDocumentMarkdown,
      };
  }
}

function authoredTextsEqual(
  left: readonly SessionImportAuthoredText[],
  right: readonly SessionImportAuthoredText[],
): boolean {
  return (
    left.length === right.length &&
    left.every(
      (value, index) =>
        value.authorName === right[index]?.authorName && value.text === right[index]?.text,
    )
  );
}

export function isSectionChanged(
  serverSnapshot: SessionImportV1Snapshot,
  draft: SessionImportV1Snapshot,
  section: ReviewSection,
): boolean {
  switch (section) {
    case "SUMMARY":
      return serverSnapshot.summary !== draft.summary;
    case "HIGHLIGHTS":
      return !authoredTextsEqual(serverSnapshot.highlights, draft.highlights);
    case "ONE_LINE_REVIEWS":
      return !authoredTextsEqual(serverSnapshot.oneLineReviews, draft.oneLineReviews);
    case "FEEDBACK_DOCUMENT":
      return (
        serverSnapshot.feedbackDocumentFileName !== draft.feedbackDocumentFileName ||
        serverSnapshot.feedbackDocumentMarkdown !== draft.feedbackDocumentMarkdown
      );
  }
}

export function selectEvidenceTarget(
  state: AiGenerationReviewState,
  targetId: string | null,
): AiGenerationReviewState {
  return {
    ...state,
    selectedTargetId:
      targetId !== null && state.invalidatedTargetIds.includes(targetId) ? null : targetId,
  };
}

export function markGroundedReviewed(
  state: AiGenerationReviewState,
  section: ReviewSection,
  serverSnapshot: SessionImportV1Snapshot,
  draft: SessionImportV1Snapshot,
): AiGenerationReviewState {
  if (isSectionChanged(serverSnapshot, draft, section)) return state;

  return withSectionReview(state, section, "AI_GROUNDED_REVIEWED");
}

export function confirmEditedSection(
  state: AiGenerationReviewState,
  section: ReviewSection,
  serverSnapshot: SessionImportV1Snapshot,
  draft: SessionImportV1Snapshot,
): AiGenerationReviewState {
  if (!isSectionChanged(serverSnapshot, draft, section)) return state;
  if (
    state.sectionReviews[section] !== "USER_EDITED_REVIEW_REQUIRED" &&
    state.sectionReviews[section] !== "USER_EDITED_CONFIRMED"
  ) {
    return state;
  }

  return withSectionReview(state, section, "USER_EDITED_CONFIRMED");
}

export function applySectionEdit(
  state: AiGenerationReviewState,
  edit: SectionEdit,
): AiGenerationReviewState {
  const sectionTargets = new Set(edit.sectionTargetIds);
  const invalidatedOutsideSection = state.invalidatedTargetIds.filter(
    (targetId) => !sectionTargets.has(targetId),
  );

  if (!isSectionChanged(edit.serverSnapshot, edit.draft, edit.section)) {
    return {
      ...state,
      sectionReviews: {
        ...state.sectionReviews,
        [edit.section]: "PENDING",
      },
      invalidatedTargetIds: invalidatedOutsideSection,
    };
  }

  const changedTargets = edit.mappingAmbiguous
    ? edit.sectionTargetIds
    : edit.sectionTargetIds.filter((targetId) => edit.changedTargetIds.includes(targetId));
  const invalidatedTargetIds = [...invalidatedOutsideSection, ...changedTargets];

  return {
    ...state,
    sectionReviews: {
      ...state.sectionReviews,
      [edit.section]: "USER_EDITED_REVIEW_REQUIRED",
    },
    selectedTargetId:
      state.selectedTargetId !== null && invalidatedTargetIds.includes(state.selectedTargetId)
        ? null
        : state.selectedTargetId,
    invalidatedTargetIds,
  };
}

export function toCommitSectionReviews(
  state: AiGenerationReviewState,
  serverSnapshot: SessionImportV1Snapshot,
  draft: SessionImportV1Snapshot,
): Record<ReviewSection, ServerSectionReviewStatus> | null {
  const result = {} as Record<ReviewSection, ServerSectionReviewStatus>;

  for (const section of REVIEW_SECTIONS) {
    const expected: ServerSectionReviewStatus = isSectionChanged(serverSnapshot, draft, section)
      ? "USER_EDITED_CONFIRMED"
      : "AI_GROUNDED_REVIEWED";
    if (state.sectionReviews[section] !== expected) return null;
    result[section] = expected;
  }

  return result;
}

function withSectionReview(
  state: AiGenerationReviewState,
  section: ReviewSection,
  review: SectionReviewState,
): AiGenerationReviewState {
  return {
    ...state,
    sectionReviews: {
      ...state.sectionReviews,
      [section]: review,
    },
  };
}
