import { useState, type ChangeEvent, type CSSProperties } from "react";
import type {
  AiGenerationProblem,
  AvailableGenerationModel,
  StartGenerationRequest,
} from "@/features/host/aigen/api/aigen-contracts";

const MAX_TRANSCRIPT_BYTES = 1024 * 1024;

export type TranscriptUploadFormProps = {
  models: AvailableGenerationModel[];
  loadingModels: boolean;
  modelError: boolean;
  startProblem: AiGenerationProblem | null;
  submitting: boolean;
  onRetryModels: () => void;
  onSubmit: (payload: StartGenerationRequest) => void;
};

function preferredModel(models: AvailableGenerationModel[]): string {
  return models.find((model) => model.isDefault)?.id ?? models[0]?.id ?? "";
}

export function TranscriptUploadForm({
  models,
  loadingModels,
  modelError,
  startProblem,
  submitting,
  onRetryModels,
  onSubmit,
}: TranscriptUploadFormProps) {
  const [transcript, setTranscript] = useState<File | null>(null);
  const [modelOverride, setModelOverride] = useState<string | null>(null);
  const [instructions, setInstructions] = useState("");
  const [fileError, setFileError] = useState<string | null>(null);

  const fallbackModel = preferredModel(models);
  const model =
    modelOverride && models.some((candidate) => candidate.id === modelOverride)
      ? modelOverride
      : fallbackModel;

  const handleFile = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    if (!file) {
      setTranscript(null);
      setFileError(null);
      return;
    }
    if (!file.name.toLocaleLowerCase("en-US").endsWith(".txt")) {
      setTranscript(null);
      setFileError("대본은 .txt 파일만 업로드할 수 있습니다.");
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
    !loadingModels &&
    !modelError &&
    !submitting &&
    !fileError;

  const handleSubmit = () => {
    if (!transcript || !model) return;
    onSubmit({
      transcript,
      model,
      ...(instructions.trim() ? { instructions } : {}),
    });
  };

  const invalidLabels =
    startProblem?.code === "TRANSCRIPT_SPEAKER_NOT_MEMBER" ||
    startProblem?.code === "TRANSCRIPT_SPEAKER_AMBIGUOUS"
      ? startProblem.invalidSpeakerLabels
      : undefined;

  return (
    <div className="stack" style={{ "--stack": "14px" } as CSSProperties}>
      <h2 style={{ margin: 0 }}>AI로 세션 기록 생성</h2>
      <p className="small" style={{ color: "var(--text-2)" }}>
        UTF-8 대본(.txt, 1 MB 이하)을 업로드해 호스트 검토용 기록을 만듭니다. 각 발화는
        현재 활성 멤버의 이름과 정확히 같은 <code>이름 MM:SS</code> 줄로 시작해야 합니다.
      </p>

      <div>
        <label className="field-label" htmlFor="aigen-transcript-file">
          대본 파일 (.txt, 최대 1 MB)
        </label>
        <input
          id="aigen-transcript-file"
          type="file"
          accept=".txt,text/plain"
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
          disabled={submitting || loadingModels || modelError}
          style={{ width: "100%" }}
        >
          {!model ? <option value="">모델 선택</option> : null}
          {models.map((option) => (
            <option key={option.id} value={option.id}>
              {option.provider} · {option.id}
            </option>
          ))}
        </select>
        {modelError ? (
          <div className="row" role="alert" style={{ gap: 8, marginTop: 8 }}>
            <span className="small" style={{ color: "var(--danger)" }}>
              사용 가능한 모델을 불러오지 못했습니다.
            </span>
            <button type="button" className="btn btn-quiet btn-sm" onClick={onRetryModels}>
              모델 다시 불러오기
            </button>
          </div>
        ) : null}
      </div>

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

      {invalidLabels?.length ? (
        <div className="surface-quiet small" role="alert" style={{ padding: 12 }}>
          <strong>멤버로 확인되지 않은 화자가 있습니다: {invalidLabels.join(", ")}</strong>
          <div style={{ marginTop: 4 }}>
            텍스트의 화자 이름을 현재 활성 멤버 이름과 같게 수정한 뒤 다시 업로드해 주세요.
          </div>
        </div>
      ) : startProblem ? (
        <div className="small" role="alert" style={{ color: "var(--danger)" }}>
          {startProblem.detail}
        </div>
      ) : null}

      <button type="button" className="btn btn-primary" disabled={!canSubmit} onClick={handleSubmit}>
        {submitting ? "시작 중…" : "생성 시작"}
      </button>
    </div>
  );
}
