import { useState, type CSSProperties } from "react";
import type {
  AiGenerationItem,
  AiRecordVisibility,
  RegenerateResponse,
  SessionImportV1,
} from "@/features/host/aigen/api/aigen-contracts";
import { RegenerateModal } from "./RegenerateModal";
import { SummarySection } from "./sections/SummarySection";
import { HighlightsSection } from "./sections/HighlightsSection";
import { OneLineReviewsSection } from "./sections/OneLineReviewsSection";
import { FeedbackDocumentSection } from "./sections/FeedbackDocumentSection";

export type PreviewViewProps = {
  sessionId: string;
  jobId: string;
  snapshot: SessionImportV1;
  recordVisibility: AiRecordVisibility;
  committing: boolean;
  commitError: string | null;
  onSnapshotChange: (next: SessionImportV1) => void;
  onVisibilityChange: (next: AiRecordVisibility) => void;
  onCommit: () => void;
};

export function PreviewView({
  sessionId,
  jobId,
  snapshot,
  recordVisibility,
  committing,
  commitError,
  onSnapshotChange,
  onVisibilityChange,
  onCommit,
}: PreviewViewProps) {
  const [regenItem, setRegenItem] = useState<AiGenerationItem | null>(null);

  const handleRegenSuccess = (response: RegenerateResponse) => {
    const value = response.value;
    if ("summary" in value) {
      onSnapshotChange({ ...snapshot, summary: value.summary });
    } else if ("highlights" in value) {
      onSnapshotChange({ ...snapshot, highlights: value.highlights });
    } else if ("oneLineReviews" in value) {
      onSnapshotChange({ ...snapshot, oneLineReviews: value.oneLineReviews });
    } else {
      onSnapshotChange({
        ...snapshot,
        feedbackDocumentFileName: value.feedbackDocumentFileName,
        feedbackDocumentMarkdown: value.feedbackDocumentMarkdown,
      });
    }
    setRegenItem(null);
  };

  return (
    <div className="stack" style={{ "--stack": "16px" } as CSSProperties}>
      <h2 style={{ margin: 0 }}>AI가 생성한 기록 미리보기</h2>
      <p className="small" style={{ color: "var(--text-2)" }}>
        섹션별로 직접 편집할 수 있습니다. ✨ 재생성 버튼으로 한 섹션만 다시 만들 수도 있습니다.
      </p>

      <SummarySection
        value={snapshot.summary}
        onChange={(value) => onSnapshotChange({ ...snapshot, summary: value })}
        onRegenerate={() => setRegenItem("summary")}
        disabled={committing}
      />

      <HighlightsSection
        items={snapshot.highlights}
        onChange={(items) => onSnapshotChange({ ...snapshot, highlights: items })}
        onRegenerate={() => setRegenItem("highlights")}
        disabled={committing}
      />

      <OneLineReviewsSection
        items={snapshot.oneLineReviews}
        onChange={(items) => onSnapshotChange({ ...snapshot, oneLineReviews: items })}
        onRegenerate={() => setRegenItem("oneLineReviews")}
        disabled={committing}
      />

      <FeedbackDocumentSection
        fileName={snapshot.feedbackDocumentFileName}
        markdown={snapshot.feedbackDocumentMarkdown}
        onChange={({ fileName, markdown }) =>
          onSnapshotChange({
            ...snapshot,
            feedbackDocumentFileName: fileName,
            feedbackDocumentMarkdown: markdown,
          })
        }
        onRegenerate={() => setRegenItem("feedbackDocument")}
        disabled={committing}
      />

      <fieldset
        className="stack"
        style={{ "--stack": "6px", border: "none", padding: 0, margin: 0 } as CSSProperties}
      >
        <legend className="field-label">공개 범위</legend>
        <label className="small">
          <input
            type="radio"
            name="aigen-visibility"
            value="MEMBER"
            checked={recordVisibility === "MEMBER"}
            onChange={() => onVisibilityChange("MEMBER")}
            disabled={committing}
          />{" "}
          멤버 공개 (MEMBER)
        </label>
        <label className="small">
          <input
            type="radio"
            name="aigen-visibility"
            value="PUBLIC"
            checked={recordVisibility === "PUBLIC"}
            onChange={() => onVisibilityChange("PUBLIC")}
            disabled={committing}
          />{" "}
          전체 공개 (PUBLIC)
        </label>
      </fieldset>

      {commitError ? (
        <div className="small" role="alert" style={{ color: "var(--danger)" }}>
          {commitError}
        </div>
      ) : null}

      <button type="button" className="btn btn-primary" onClick={onCommit} disabled={committing}>
        {committing ? "저장 중…" : "AI 기록 저장"}
      </button>

      {regenItem ? (
        <RegenerateModal
          open
          sessionId={sessionId}
          jobId={jobId}
          item={regenItem}
          onClose={() => setRegenItem(null)}
          onSuccess={handleRegenSuccess}
        />
      ) : null}
    </div>
  );
}
