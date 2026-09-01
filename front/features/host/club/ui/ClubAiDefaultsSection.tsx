import type { CSSProperties } from "react";
import { CLUB_AI_MODEL_OPTIONS, CLUB_AI_OPENAI_DEFAULT_MODEL_ID } from "./club-ai-model-options";

export type ClubAiDefaultsPresentation = {
  enabled: boolean;
  capabilityLoading: boolean;
  capabilityError: boolean;
  model: string | null;
  loading: boolean;
  pending: boolean;
  error: string | null;
  saved: boolean;
  canSave: boolean;
  onModelChange: (model: string) => void;
  onSave: () => void;
  onRetryCapabilities: () => void;
  onRetryDefault: () => void;
};

export type ClubAiDefaultsSectionProps = {
  state: ClubAiDefaultsPresentation;
  variant?: "default" | "compact";
};

export function ClubAiDefaultsSection({ state, variant = "default" }: ClubAiDefaultsSectionProps) {
  const selected = state.model ?? CLUB_AI_OPENAI_DEFAULT_MODEL_ID;
  return (
    <section
      aria-labelledby="club-ai-defaults-heading"
      className={variant === "compact" ? "rm-host-ai-tool rm-host-ai-tool--ledger" : "stack"}
      style={variant === "compact" ? undefined : ({ "--stack": "12px" } as CSSProperties)}
    >
      <header className={variant === "compact" ? "rm-host-ai-tool__header" : undefined}>
        <h2 id="club-ai-defaults-heading" style={{ margin: 0 }}>{variant === "compact" ? "AI 기본 모델" : "AI 기본 모델 설정"}</h2>
        <p className="small" style={{ color: "var(--text-2)", margin: "4px 0 0" }}>
          {variant === "compact" ? "새 모임 AI 생성에 적용할 기본값입니다." : "새 모임 AI 생성에 사용할 기본 모델입니다. 호스트가 업로드 시 다른 모델로 바꿀 수도 있습니다."}
        </p>
      </header>
      {state.capabilityLoading ? <div className="small" role="status">AI 기능을 확인하는 중입니다.</div> : null}
      {state.capabilityError ? (
        <div className="small" role="alert">AI 기능 상태를 확인하지 못했습니다. <button type="button" className="btn btn-ghost btn-sm" onClick={state.onRetryCapabilities}>다시 시도</button></div>
      ) : null}
      {!state.capabilityLoading && !state.capabilityError && !state.enabled ? (
        <div className="small" role="status">AI 생성 기능이 현재 꺼져 있어 기본 모델을 변경할 수 없습니다.</div>
      ) : null}
      {state.enabled && state.error ? (
        <div className="small" role="alert">{state.error} <button type="button" className="btn btn-ghost btn-sm" onClick={state.onRetryDefault}>다시 시도</button></div>
      ) : null}
      {state.enabled ? (
        <>
          <div className={variant === "compact" ? "rm-host-ai-tool__field" : undefined}>
            <label className="field-label" htmlFor="club-ai-default-model">기본 모델</label>
            <select id="club-ai-default-model" className="input" value={selected} onChange={(event) => state.onModelChange(event.target.value)} disabled={state.loading || state.pending} style={{ width: "100%" }}>
              {CLUB_AI_MODEL_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </div>
          <div className="row rm-host-ai-tool__actions" style={{ gap: 12, alignItems: "center" }}>
            <button type="button" className="btn btn-primary btn-sm" onClick={state.onSave} disabled={!state.canSave}>{state.pending ? "저장 중…" : "저장"}</button>
            {state.loading ? <span className="small">불러오는 중…</span> : null}
          </div>
          <div aria-live="polite" className="small" style={{ minHeight: "1.25em" }}>
            {state.saved && !state.error ? <span>변경 사항은 새 generation 부터 적용됩니다.</span> : null}
          </div>
        </>
      ) : null}
    </section>
  );
}
