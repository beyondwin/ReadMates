import type { CSSProperties, ReactNode } from "react";

export type SummarySectionProps = {
  value: string;
  onChange: (next: string) => void;
  onRegenerate: () => void;
  disabled?: boolean;
  sectionId?: string;
  evidenceControls?: ReactNode;
};

export function SummarySection({ value, onChange, onRegenerate, disabled, sectionId, evidenceControls }: SummarySectionProps) {
  return (
    <section id={sectionId} className="surface-quiet" style={{ padding: 16 } as CSSProperties}>
      <header className="row-between" style={{ marginBottom: 10 }}>
        <h3 className="eyebrow" style={{ margin: 0 }}>요약</h3>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={onRegenerate}
          disabled={disabled}
          aria-label="요약 재생성"
        >
          ✨ 재생성
        </button>
      </header>
      <label className="field-label" htmlFor="aigen-summary-field" style={{ display: "block", marginBottom: 6 }}>
        요약
      </label>
      <textarea
        id="aigen-summary-field"
        className="textarea"
        rows={6}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
        style={{ width: "100%" }}
      />
      {evidenceControls}
    </section>
  );
}
