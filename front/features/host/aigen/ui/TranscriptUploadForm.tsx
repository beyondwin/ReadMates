import { useState, type ChangeEvent, type CSSProperties, type FormEvent } from "react";
import type {
  AiAuthorNameMode,
  StartGenerationRequest,
} from "@/features/host/aigen/api/aigen-contracts";
import { AIGEN_MODEL_OPTIONS } from "./aigen-model-options";

const MAX_TRANSCRIPT_BYTES = 1 * 1024 * 1024;
const ACCEPTED_EXTENSION = ".txt";

export type TranscriptUploadFormProps = {
  /** Pre-selected model from the club default. May be null until loaded. */
  defaultModel: string | null;
  loadingDefaults: boolean;
  submitting: boolean;
  onSubmit: (payload: StartGenerationRequest) => void;
};

export function TranscriptUploadForm({
  defaultModel,
  loadingDefaults,
  submitting,
  onSubmit,
}: TranscriptUploadFormProps) {
  const [transcript, setTranscript] = useState<File | null>(null);
  // Track the user's explicit override separately from the club default so
  // we can derive the active model without a setState-in-effect cascade.
  const [modelOverride, setModelOverride] = useState<string | null>(null);
  const [authorNameMode, setAuthorNameMode] = useState<AiAuthorNameMode>("alias");
  const [instructions, setInstructions] = useState("");
  const [fileError, setFileError] = useState<string | null>(null);

  const model = modelOverride ?? defaultModel ?? "";

  const handleFile = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    if (!file) {
      setTranscript(null);
      setFileError(null);
      return;
    }
    if (file.size > MAX_TRANSCRIPT_BYTES) {
      setTranscript(null);
      setFileError("대본 파일은 1 MB 이하여야 합니다.");
      return;
    }
    setFileError(null);
    setTranscript(file);
  };

  const canSubmit =
    Boolean(transcript) &&
    Boolean(model) &&
    !loadingDefaults &&
    !submitting &&
    !fileError;

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!transcript || !model) return;
    const payload: StartGenerationRequest = {
      transcript,
      model,
      authorNameMode,
      ...(instructions.trim() ? { instructions } : {}),
    };
    onSubmit(payload);
  };

  return (
    <form className="stack" style={{ "--stack": "14px" } as CSSProperties} onSubmit={handleSubmit}>
      <h2 style={{ margin: 0 }}>AI로 세션 기록 생성</h2>
      <p className="small" style={{ color: "var(--text-2)" }}>
        모임 대본(.txt, 1 MB 이하)을 업로드하면 요약·하이라이트·한줄평·피드백 문서를 자동으로 만듭니다.
      </p>

      <div>
        <label className="field-label" htmlFor="aigen-transcript-file">
          대본 파일 (.txt, 최대 1 MB)
        </label>
        <input
          id="aigen-transcript-file"
          type="file"
          accept={`${ACCEPTED_EXTENSION},text/plain`}
          onChange={handleFile}
          disabled={submitting}
        />
        {fileError ? (
          <div className="small" role="alert" style={{ color: "var(--danger)", marginTop: 6 }}>
            {fileError}
          </div>
        ) : null}
      </div>

      <div>
        <label className="field-label" htmlFor="aigen-model-select">
          모델
        </label>
        <select
          id="aigen-model-select"
          className="input"
          value={model}
          onChange={(event) => setModelOverride(event.target.value)}
          disabled={submitting || loadingDefaults}
          style={{ width: "100%" }}
        >
          {!model ? <option value="">모델 선택</option> : null}
          {AIGEN_MODEL_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      <fieldset className="stack" style={{ "--stack": "6px", border: "none", padding: 0, margin: 0 } as CSSProperties}>
        <legend className="field-label">발화자 이름 표시</legend>
        <label className="small">
          <input
            type="radio"
            name="aigen-author-mode"
            value="alias"
            checked={authorNameMode === "alias"}
            onChange={() => setAuthorNameMode("alias")}
            disabled={submitting}
          />{" "}
          닉네임 (별칭) 사용
        </label>
        <label className="small">
          <input
            type="radio"
            name="aigen-author-mode"
            value="real"
            checked={authorNameMode === "real"}
            onChange={() => setAuthorNameMode("real")}
            disabled={submitting}
          />{" "}
          실명 표시
        </label>
      </fieldset>

      <div>
        <label className="field-label" htmlFor="aigen-instructions">
          추가 지시문 (선택)
        </label>
        <textarea
          id="aigen-instructions"
          className="textarea"
          rows={3}
          value={instructions}
          onChange={(event) => setInstructions(event.target.value)}
          disabled={submitting}
          style={{ width: "100%" }}
        />
      </div>

      {/* TODO(task_3_4): wire to real cost/cap data once the endpoint exists. */}
      <dl data-testid="aigen-cost-estimate" className="small" style={{ margin: 0, color: "var(--text-2)" }}>
        <dt style={{ display: "inline" }}>예상 비용</dt>
        <dd style={{ display: "inline", marginLeft: 6 }}>- USD</dd>
        <span aria-hidden="true"> · </span>
        <dt style={{ display: "inline" }}>남은 한도</dt>
        <dd style={{ display: "inline", marginLeft: 6 }}>-</dd>
      </dl>

      <button type="submit" className="btn btn-primary" disabled={!canSubmit}>
        {submitting ? "시작 중…" : "생성 시작"}
      </button>
    </form>
  );
}
