import type { CSSProperties, ReactNode } from "react";
import type { SessionImportAuthoredText } from "@/features/host/aigen/api/aigen-contracts";

export type HighlightsSectionProps = {
  items: SessionImportAuthoredText[];
  onChange: (next: SessionImportAuthoredText[]) => void;
  onRegenerate: () => void;
  disabled?: boolean;
  sectionId?: string;
  evidenceControls?: ReactNode;
};

export function HighlightsSection({ items, onChange, onRegenerate, disabled, sectionId, evidenceControls }: HighlightsSectionProps) {
  const updateAt = (index: number, patch: Partial<SessionImportAuthoredText>) => {
    const next = items.map((item, i) => (i === index ? { ...item, ...patch } : item));
    onChange(next);
  };

  return (
    <section id={sectionId} className="surface-quiet" style={{ padding: 16 } as CSSProperties}>
      <header className="row-between" style={{ marginBottom: 10 }}>
        <h3 className="eyebrow" style={{ margin: 0 }}>하이라이트</h3>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={onRegenerate}
          disabled={disabled}
          aria-label="하이라이트 재생성"
        >
          ✨ 재생성
        </button>
      </header>
      <ul className="stack" style={{ "--stack": "10px", listStyle: "none", margin: 0, padding: 0 } as CSSProperties}>
        {items.length === 0 ? (
          <li className="small" style={{ color: "var(--text-2)" }}>하이라이트가 없습니다.</li>
        ) : null}
        {items.map((item, index) => (
          <li key={`highlight-${index}`} className="stack" style={{ "--stack": "6px" } as CSSProperties}>
            <input
              type="text"
              className="input"
              value={item.authorName}
              onChange={(event) => updateAt(index, { authorName: event.target.value })}
              disabled={disabled}
              aria-label={`하이라이트 ${index + 1} 발화자`}
              style={{ width: "100%" }}
            />
            <textarea
              className="textarea"
              rows={3}
              value={item.text}
              onChange={(event) => updateAt(index, { text: event.target.value })}
              disabled={disabled}
              aria-label={`하이라이트 ${index + 1} 내용`}
              style={{ width: "100%" }}
            />
          </li>
        ))}
      </ul>
      {evidenceControls}
    </section>
  );
}
