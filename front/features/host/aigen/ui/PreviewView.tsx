import { useMemo, useState, type CSSProperties } from "react";
import type {
  AiEvidenceExcerpt,
  AiGenerationItem,
  AiGenerationProblem,
  AiRecordVisibility,
  AvailableGenerationModel,
  ExpandedEvidenceTurn,
  RegenerateResponse,
  ReviewSection,
  SessionImportV1,
} from "@/features/host/aigen/api/aigen-contracts";
import {
  confirmEditedSection,
  isSectionChanged,
  markGroundedReviewed,
  selectEvidenceTarget,
  type AiGenerationReviewState,
} from "../model/aigen-review-state";
import { EvidenceDrawer } from "./EvidenceDrawer";
import { EvidencePanel } from "./EvidencePanel";
import { RegenerateModal } from "./RegenerateModal";
import { ReviewLedger } from "./ReviewLedger";
import { FeedbackDocumentSection } from "./sections/FeedbackDocumentSection";
import { HighlightsSection } from "./sections/HighlightsSection";
import { OneLineReviewsSection } from "./sections/OneLineReviewsSection";
import { SummarySection } from "./sections/SummarySection";

const SECTION_ID: Record<ReviewSection, string> = {
  SUMMARY: "aigen-review-summary",
  HIGHLIGHTS: "aigen-review-highlights",
  ONE_LINE_REVIEWS: "aigen-review-one-line-reviews",
  FEEDBACK_DOCUMENT: "aigen-review-feedback-document",
};

const SECTION_LABEL: Record<ReviewSection, string> = {
  SUMMARY: "요약",
  HIGHLIGHTS: "하이라이트",
  ONE_LINE_REVIEWS: "한줄평",
  FEEDBACK_DOCUMENT: "피드백 문서",
};

export type PreviewViewProps = {
  sessionId: string;
  jobId: string;
  snapshot: SessionImportV1;
  recordVisibility: AiRecordVisibility;
  committing: boolean;
  commitError: string | null;
  models?: AvailableGenerationModel[];
  revision?: number;
  serverSnapshot?: SessionImportV1;
  evidence?: AiEvidenceExcerpt[];
  reviewState?: AiGenerationReviewState;
  storageWarning?: boolean;
  revisionConflict?: AiGenerationProblem | null;
  commitEnabled?: boolean;
  onSnapshotChange: (next: SessionImportV1, section?: ReviewSection) => void;
  onReviewStateChange?: (next: AiGenerationReviewState) => void;
  onRegenerated?: (response: RegenerateResponse) => void;
  onExpandEvidence?: (turnId: string, revision: number) => Promise<ExpandedEvidenceTurn>;
  onReloadRevision?: () => void;
  onVisibilityChange: (next: AiRecordVisibility) => void;
  onCommit: () => void;
};

export function PreviewView(props: PreviewViewProps) {
  const {
    sessionId,
    jobId,
    snapshot,
    recordVisibility,
    committing,
    commitError,
    models = [],
    revision,
    serverSnapshot,
    evidence = [],
    reviewState,
    storageWarning = false,
    revisionConflict,
    commitEnabled = true,
    onSnapshotChange,
    onReviewStateChange,
    onRegenerated,
    onExpandEvidence,
    onReloadRevision,
    onVisibilityChange,
    onCommit,
  } = props;
  const [regenItem, setRegenItem] = useState<AiGenerationItem | null>(null);
  const [currentSection, setCurrentSection] = useState<ReviewSection | null>("SUMMARY");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const grounded =
    revision !== undefined && serverSnapshot !== undefined && reviewState !== undefined;

  const targets = useMemo(() => {
    const bySection = new Map<ReviewSection, Array<{ targetId: string; ordinal: number }>>();
    for (const item of evidence) {
      const list = bySection.get(item.section) ?? [];
      if (!list.some((target) => target.targetId === item.targetId)) {
        list.push({ targetId: item.targetId, ordinal: item.ordinal });
        list.sort((left, right) => left.ordinal - right.ordinal);
        bySection.set(item.section, list);
      }
    }
    return bySection;
  }, [evidence]);

  const selectedEvidence = reviewState?.selectedTargetId
    ? evidence.find((item) => item.targetId === reviewState.selectedTargetId)
    : undefined;
  const selectedLabel = selectedEvidence
    ? `${SECTION_LABEL[selectedEvidence.section]} ${selectedEvidence.ordinal + 1}`
    : null;

  const updateSection = (section: ReviewSection, next: SessionImportV1) => {
    onSnapshotChange(next, section);
  };

  const handleRegenSuccess = (response: RegenerateResponse) => {
    if (grounded && onRegenerated) {
      onRegenerated(response);
      setDrawerOpen(false);
      setRegenItem(null);
      return;
    }
    const value = response.value;
    if ("summary" in value) onSnapshotChange({ ...snapshot, summary: value.summary });
    else if ("highlights" in value) onSnapshotChange({ ...snapshot, highlights: value.highlights });
    else if ("oneLineReviews" in value) onSnapshotChange({ ...snapshot, oneLineReviews: value.oneLineReviews });
    else {
      onSnapshotChange({
        ...snapshot,
        feedbackDocumentFileName: value.feedbackDocumentFileName,
        feedbackDocumentMarkdown: value.feedbackDocumentMarkdown,
      });
    }
    setRegenItem(null);
  };

  const navigate = (section: ReviewSection) => {
    setCurrentSection(section);
    document.getElementById(SECTION_ID[section])?.scrollIntoView({ block: "start" });
  };

  const evidenceControl = (section: ReviewSection, ordinal: number, itemLabel: string) => {
    if (!grounded || !reviewState || !onReviewStateChange) return null;
    const target = (targets.get(section) ?? []).find((candidate) => candidate.ordinal === ordinal);
    if (!target) return null;
    const invalidated = reviewState.invalidatedTargetIds.includes(target.targetId);
    return (
      <button
        type="button"
        className="btn btn-quiet btn-sm aigen-block-evidence-control"
        disabled={invalidated}
        onClick={() => {
          setCurrentSection(section);
          onReviewStateChange(selectEvidenceTarget(reviewState, target.targetId));
          if (window.matchMedia?.("(max-width: 768px)").matches) setDrawerOpen(true);
        }}
      >
        {invalidated ? `${itemLabel}: 직접 수정됨 — AI 근거 비활성` : `${itemLabel} 근거 보기`}
      </button>
    );
  };

  const sectionEvidenceControls = (section: ReviewSection, itemLabel: string) => {
    const sectionTargets = targets.get(section) ?? [];
    if (sectionTargets.length === 0) return null;
    return (
      <div className="stack" style={{ "--stack": "6px", marginTop: 10 } as CSSProperties} aria-label={`${SECTION_LABEL[section]} 근거 연결`}>
        {sectionTargets.map((target) => (
          <div className="row-between" key={target.targetId} style={{ gap: 8 }}>
            <span className="tiny" style={{ color: "var(--text-2)" }}>{itemLabel} {target.ordinal + 1}</span>
            {evidenceControl(section, target.ordinal, `${itemLabel} ${target.ordinal + 1}`)}
          </div>
        ))}
      </div>
    );
  };

  const reviewAction = (section: ReviewSection) => {
    if (!grounded || !reviewState || !serverSnapshot || !onReviewStateChange) return null;
    const changed = isSectionChanged(serverSnapshot, snapshot, section);
    const state = reviewState.sectionReviews[section];
    const complete = state === "AI_GROUNDED_REVIEWED" || state === "USER_EDITED_CONFIRMED";
    return (
      <div className="row-between" style={{ gap: 10, marginTop: 8 }}>
        <span className="tiny" style={{ color: "var(--text-2)" }}>
          {changed ? "직접 수정한 섹션" : "AI 결과와 연결 근거 검토"}
        </span>
        {complete ? (
          <span className="small" role="status">검토 완료</span>
        ) : (
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={() =>
              onReviewStateChange(
                changed
                  ? confirmEditedSection(reviewState, section, serverSnapshot, snapshot)
                  : markGroundedReviewed(reviewState, section, serverSnapshot, snapshot),
              )
            }
          >
            {changed ? "직접 수정 내용 확인" : "AI 근거 검토 완료"}
          </button>
        )}
      </div>
    );
  };

  const evidencePanel = grounded && revision !== undefined && onExpandEvidence ? (
    <EvidencePanel
      key={`${revision}:${reviewState?.selectedTargetId ?? "none"}`}
      targetId={reviewState?.selectedTargetId ?? null}
      targetLabel={selectedLabel}
      evidence={evidence}
      revision={revision}
      invalidated={Boolean(
        reviewState?.selectedTargetId &&
          reviewState.invalidatedTargetIds.includes(reviewState.selectedTargetId),
      )}
      onExpand={onExpandEvidence}
    />
  ) : null;

  return (
    <div className="stack" style={{ "--stack": "16px" } as CSSProperties}>
      <h2 style={{ margin: 0 }}>AI가 생성한 기록 미리보기</h2>
      <p className="small" style={{ color: "var(--text-2)" }}>
        결과는 항상 호스트 검토 초안입니다. 검토가 끝나기 전에는 저장되거나 공개되지 않습니다.
      </p>

      <div className={grounded ? "aigen-review-workspace" : undefined}>
        {grounded && reviewState ? (
          <aside className="aigen-review-ledger-column">
            <ReviewLedger
              states={reviewState.sectionReviews}
              currentSection={currentSection}
              onNavigate={navigate}
            />
          </aside>
        ) : null}
        <div className="stack aigen-review-editor" style={{ "--stack": "14px" } as CSSProperties}>
          <div onFocusCapture={() => setCurrentSection("SUMMARY")}>
            <SummarySection
              sectionId={SECTION_ID.SUMMARY}
              value={snapshot.summary}
              onChange={(summary) => updateSection("SUMMARY", { ...snapshot, summary })}
              onRegenerate={() => setRegenItem("summary")}
              disabled={committing}
              regenerateDisabled={Boolean(revisionConflict)}
              evidenceControls={sectionEvidenceControls("SUMMARY", "요약 문단")}
            />
            {reviewAction("SUMMARY")}
          </div>
          <div onFocusCapture={() => setCurrentSection("HIGHLIGHTS")}>
            <HighlightsSection
              sectionId={SECTION_ID.HIGHLIGHTS}
              items={snapshot.highlights}
              onChange={(highlights) => updateSection("HIGHLIGHTS", { ...snapshot, highlights })}
              onRegenerate={() => setRegenItem("highlights")}
              disabled={committing}
              regenerateDisabled={Boolean(revisionConflict)}
              evidenceControlAt={(index) => evidenceControl("HIGHLIGHTS", index, `하이라이트 ${index + 1}`)}
            />
            {reviewAction("HIGHLIGHTS")}
          </div>
          <div onFocusCapture={() => setCurrentSection("ONE_LINE_REVIEWS")}>
            <OneLineReviewsSection
              sectionId={SECTION_ID.ONE_LINE_REVIEWS}
              items={snapshot.oneLineReviews}
              onChange={(oneLineReviews) => updateSection("ONE_LINE_REVIEWS", { ...snapshot, oneLineReviews })}
              onRegenerate={() => setRegenItem("oneLineReviews")}
              disabled={committing}
              regenerateDisabled={Boolean(revisionConflict)}
              evidenceControlAt={(index) => evidenceControl("ONE_LINE_REVIEWS", index, `한줄평 ${index + 1}`)}
            />
            {reviewAction("ONE_LINE_REVIEWS")}
          </div>
          <div onFocusCapture={() => setCurrentSection("FEEDBACK_DOCUMENT")}>
            <FeedbackDocumentSection
              sectionId={SECTION_ID.FEEDBACK_DOCUMENT}
              fileName={snapshot.feedbackDocumentFileName}
              markdown={snapshot.feedbackDocumentMarkdown}
              onChange={({ fileName, markdown }) =>
                updateSection("FEEDBACK_DOCUMENT", {
                  ...snapshot,
                  feedbackDocumentFileName: fileName,
                  feedbackDocumentMarkdown: markdown,
                })
              }
              onRegenerate={() => setRegenItem("feedbackDocument")}
              disabled={committing}
              regenerateDisabled={Boolean(revisionConflict)}
              evidenceControls={sectionEvidenceControls("FEEDBACK_DOCUMENT", "피드백 블록")}
            />
            {reviewAction("FEEDBACK_DOCUMENT")}
          </div>
        </div>
        {grounded ? <aside className="surface aigen-evidence-panel" style={{ padding: 14 }}>{evidencePanel}</aside> : null}
      </div>

      {grounded && selectedLabel ? (
        <EvidenceDrawer open={drawerOpen} targetLabel={selectedLabel} onClose={() => setDrawerOpen(false)}>
          {evidencePanel}
        </EvidenceDrawer>
      ) : null}

      <fieldset className="stack" style={{ "--stack": "6px", border: "none", padding: 0, margin: 0 } as CSSProperties}>
        <legend className="field-label">공개 범위</legend>
        <label className="small"><input type="radio" name="aigen-visibility" value="MEMBER" checked={recordVisibility === "MEMBER"} onChange={() => onVisibilityChange("MEMBER")} disabled={committing} /> 멤버 공개 (MEMBER)</label>
        <label className="small"><input type="radio" name="aigen-visibility" value="PUBLIC" checked={recordVisibility === "PUBLIC"} onChange={() => onVisibilityChange("PUBLIC")} disabled={committing} /> 전체 공개 (PUBLIC)</label>
      </fieldset>

      {storageWarning ? <div className="small" role="status">이 브라우저에서 임시저장되지 않음</div> : null}
      {revisionConflict ? (
        <div className="surface-quiet small" role="alert" style={{ padding: 12 }}>
          서버에 더 최신 revision이 있습니다. 현재 편집은 자동으로 덮어쓰지 않았습니다. 다시 불러오면 검토 상태가 초기화됩니다.
          <div style={{ marginTop: 8 }}><button type="button" className="btn btn-quiet btn-sm" onClick={onReloadRevision}>최신 revision 다시 불러오기</button></div>
        </div>
      ) : null}
      {commitError ? <div className="small" role="alert" style={{ color: "var(--danger)" }}>{commitError}</div> : null}
      <button type="button" className="btn btn-primary" onClick={onCommit} disabled={committing || Boolean(revisionConflict) || (grounded && !commitEnabled)}>
        {committing ? "초안 저장 중…" : "초안으로 저장"}
      </button>

      {regenItem ? (
        <RegenerateModal
          open
          sessionId={sessionId}
          jobId={jobId}
          item={regenItem}
          models={models}
          expectedRevision={revision}
          onClose={() => setRegenItem(null)}
          onSuccess={handleRegenSuccess}
        />
      ) : null}
    </div>
  );
}
