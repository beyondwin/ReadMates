import type { CSSProperties } from "react";
import type { ReviewSection } from "../api/aigen-contracts";
import type { SectionReviewState } from "../model/aigen-review-state";

const SECTIONS: ReviewSection[] = [
  "SUMMARY",
  "HIGHLIGHTS",
  "ONE_LINE_REVIEWS",
  "FEEDBACK_DOCUMENT",
];

const SECTION_LABEL: Record<ReviewSection, string> = {
  SUMMARY: "요약",
  HIGHLIGHTS: "하이라이트",
  ONE_LINE_REVIEWS: "한줄평",
  FEEDBACK_DOCUMENT: "피드백 문서",
};

const STATE_LABEL: Record<SectionReviewState, string> = {
  PENDING: "검토 대기",
  AI_GROUNDED_REVIEWED: "AI 근거 검토 완료",
  USER_EDITED_REVIEW_REQUIRED: "수정 후 재검토 필요",
  USER_EDITED_CONFIRMED: "직접 수정 확인 완료",
};

export type ReviewLedgerProps = {
  states: Record<ReviewSection, SectionReviewState>;
  currentSection: ReviewSection | null;
  onNavigate: (section: ReviewSection) => void;
};

export function ReviewLedger({ states, currentSection, onNavigate }: ReviewLedgerProps) {
  const reviewed = SECTIONS.filter(
    (section) =>
      states[section] === "AI_GROUNDED_REVIEWED" ||
      states[section] === "USER_EDITED_CONFIRMED",
  ).length;

  return (
    <aside className="surface-quiet" aria-labelledby="aigen-review-ledger-heading" style={{ padding: 14 }}>
      <div className="row-between" style={{ gap: 8 }}>
        <h2 id="aigen-review-ledger-heading" className="eyebrow" style={{ margin: 0 }}>
          검토 원장
        </h2>
        <span className="small" aria-live="polite">{reviewed}/4 검토 완료</span>
      </div>
      <ol
        className="stack"
        style={{ "--stack": "6px", listStyle: "none", padding: 0, margin: "12px 0 0" } as CSSProperties}
      >
        {SECTIONS.map((section) => (
          <li key={section}>
            <button
              type="button"
              className="btn btn-quiet btn-sm"
              aria-current={currentSection === section ? "true" : undefined}
              onClick={() => onNavigate(section)}
              style={{ width: "100%", justifyContent: "space-between", textAlign: "left" }}
            >
              <span>{SECTION_LABEL[section]}</span>
              <span className="tiny">{STATE_LABEL[states[section]]}</span>
            </button>
          </li>
        ))}
      </ol>
    </aside>
  );
}
