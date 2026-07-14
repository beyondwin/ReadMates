import type { CSSProperties, ReactNode } from "react";

export type FeedbackDocumentSectionProps = {
  fileName: string;
  markdown: string;
  onChange: (next: { fileName: string; markdown: string }) => void;
  onRegenerate: () => void;
  disabled?: boolean;
  regenerateDisabled?: boolean;
  sectionId?: string;
  evidenceControls?: ReactNode;
};

export function FeedbackDocumentSection({
  fileName,
  markdown,
  onChange,
  onRegenerate,
  disabled,
  regenerateDisabled,
  sectionId,
  evidenceControls,
}: FeedbackDocumentSectionProps) {
  return (
    <section id={sectionId} className="surface-quiet" style={{ padding: 16 } as CSSProperties}>
      <header className="row-between" style={{ marginBottom: 10 }}>
        <h3 className="eyebrow" style={{ margin: 0 }}>회차 피드백 문서</h3>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={onRegenerate}
          disabled={disabled || regenerateDisabled}
          aria-label="피드백 문서 재생성"
        >
          ✨ 재생성
        </button>
      </header>
      <label className="field-label" htmlFor="aigen-feedback-filename" style={{ display: "block", marginBottom: 6 }}>
        파일 이름
      </label>
      <input
        id="aigen-feedback-filename"
        type="text"
        className="input"
        value={fileName}
        onChange={(event) => onChange({ fileName: event.target.value, markdown })}
        disabled={disabled}
        style={{ width: "100%", marginBottom: 12 }}
      />
      <label className="field-label" htmlFor="aigen-feedback-md" style={{ display: "block", marginBottom: 6 }}>
        문서 본문 (Markdown)
      </label>
      <textarea
        id="aigen-feedback-md"
        className="textarea"
        rows={10}
        value={markdown}
        onChange={(event) => onChange({ fileName, markdown: event.target.value })}
        disabled={disabled}
        style={{ width: "100%" }}
      />
      {evidenceControls}
    </section>
  );
}
