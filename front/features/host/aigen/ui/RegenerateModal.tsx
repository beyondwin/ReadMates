import { useState, type CSSProperties } from "react";
import { regenerateItem } from "@/features/host/aigen/api/aigen-api";
import type {
  AiGenerationItem,
  AvailableGenerationModel,
  RegenerateRequest,
  RegenerateResponse,
} from "@/features/host/aigen/api/aigen-contracts";

export type RegenerateModalProps = {
  open: boolean;
  sessionId: string;
  jobId: string;
  item: AiGenerationItem;
  models?: AvailableGenerationModel[];
  expectedRevision?: number;
  onClose: () => void;
  onSuccess: (response: RegenerateResponse) => void;
};

// Server defect: `parseGenerationItem` (AiGenerationWebDtos.kt) uppercases the
// incoming value and matches against SNAKE_CASE enum names, so the camelCase
// strings from spec §7.3 (e.g. "oneLineReviews") 400 with "invalid item".
// Workaround: send UPPER_SNAKE_CASE here. The contract types stay camelCase.
const ITEM_TO_SNAKE: Record<AiGenerationItem, string> = {
  summary: "SUMMARY",
  highlights: "HIGHLIGHTS",
  oneLineReviews: "ONE_LINE_REVIEWS",
  feedbackDocument: "FEEDBACK_DOCUMENT",
};

const ITEM_LABEL: Record<AiGenerationItem, string> = {
  summary: "요약",
  highlights: "하이라이트",
  oneLineReviews: "한줄평",
  feedbackDocument: "회차 피드백 문서",
};

export function RegenerateModal({
  open,
  sessionId,
  jobId,
  item,
  models = [],
  expectedRevision,
  onClose,
  onSuccess,
}: RegenerateModalProps) {
  const [instructions, setInstructions] = useState("");
  const [model, setModel] = useState<string>("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  const handleConfirm = async () => {
    setError(null);
    setPending(true);
    try {
      // Type assertion: contract item type is camelCase; SNAKE_CASE is the
      // server-side workaround value (see comment near ITEM_TO_SNAKE).
      const request = {
        item: ITEM_TO_SNAKE[item] as unknown as AiGenerationItem,
        ...(model ? { model } : {}),
        ...(instructions.trim() ? { instructions } : {}),
        ...(expectedRevision !== undefined ? { expectedRevision } : {}),
      } satisfies RegenerateRequest;
      const response = await regenerateItem(sessionId, jobId, request);
      onSuccess(response);
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "재생성에 실패했습니다.";
      setError(message);
    } finally {
      setPending(false);
    }
  };

  return (
    <div
      role="presentation"
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(22, 24, 29, 0.46)",
        zIndex: 80,
        display: "grid",
        placeItems: "center",
        padding: "20px",
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="aigen-regenerate-title"
        className="surface"
        style={{ width: "min(520px, 100%)", padding: "24px", position: "relative" }}
      >
        <h2 id="aigen-regenerate-title" style={{ margin: 0 }}>
          {ITEM_LABEL[item]} 재생성
        </h2>

        <div className="stack" style={{ "--stack": "14px", marginTop: 16 } as CSSProperties}>
          <div>
            <label className="field-label" htmlFor="aigen-regenerate-instructions">
              지시문 (선택)
            </label>
            <textarea
              id="aigen-regenerate-instructions"
              className="textarea"
              rows={3}
              value={instructions}
              onChange={(event) => setInstructions(event.target.value)}
              disabled={pending}
              style={{ width: "100%" }}
            />
          </div>

          <div>
            <label className="field-label" htmlFor="aigen-regenerate-model">
              모델 변경 (선택)
            </label>
            <select
              id="aigen-regenerate-model"
              className="input"
              value={model}
              onChange={(event) => setModel(event.target.value)}
              disabled={pending}
              style={{ width: "100%" }}
            >
              <option value="">기본 모델 사용</option>
              {models.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.provider} · {option.id}
                </option>
              ))}
            </select>
          </div>

          <div className="small" data-testid="aigen-regenerate-cost">
            예상 비용은 확정 시 갱신됩니다.
          </div>

          {error ? (
            <div className="small" role="alert" style={{ color: "var(--danger)" }}>
              {error}
            </div>
          ) : null}
        </div>

        <div
          className="actions"
          style={{ display: "flex", flexWrap: "wrap", gap: "10px", marginTop: "22px", justifyContent: "flex-end" }}
        >
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={onClose}
            disabled={pending}
          >
            닫기
          </button>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={handleConfirm}
            disabled={pending}
          >
            {pending ? "생성 중…" : "확인"}
          </button>
        </div>

        {pending ? (
          <div
            role="status"
            aria-label="재생성 중"
            style={{
              position: "absolute",
              inset: 0,
              background: "rgba(255,255,255,0.6)",
              display: "grid",
              placeItems: "center",
              borderRadius: "inherit",
            }}
          >
            <span className="small">재생성 중…</span>
          </div>
        ) : null}
      </div>
    </div>
  );
}
