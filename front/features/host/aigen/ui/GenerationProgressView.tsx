import { useEffect, useState, type CSSProperties } from "react";
import type {
  AiGenerationJobResponse,
  AiGenerationStage,
} from "@/features/host/aigen/api/aigen-contracts";

const STAGE_LABEL: Record<AiGenerationStage, string> = {
  QUEUED: "대기 중",
  TRANSCRIPT_LOADED: "대본 분석",
  GENERATING_SUMMARY: "요약 생성 중",
  GENERATING_HIGHLIGHTS: "하이라이트 생성 중",
  GENERATING_ONE_LINE_REVIEWS: "한줄평 생성 중",
  GENERATING_FEEDBACK_DOCUMENT: "회차 피드백 작성 중",
  VALIDATING: "결과 검증 중",
  READY: "완료 정리 중",
};

export type GenerationProgressViewProps = {
  job: AiGenerationJobResponse | undefined;
  cancelling: boolean;
  onCancel: () => void;
};

export function GenerationProgressView({ job, cancelling, onCancel }: GenerationProgressViewProps) {
  const [elapsedSec, setElapsedSec] = useState(0);

  useEffect(() => {
    const start = Date.now();
    const handle = window.setInterval(() => {
      setElapsedSec(Math.floor((Date.now() - start) / 1000));
    }, 1000);
    return () => window.clearInterval(handle);
  }, []);

  const stageText = job?.stage ? STAGE_LABEL[job.stage] : "준비 중";
  const progressPct = job?.progressPct ?? 0;

  return (
    <div className="stack" style={{ "--stack": "14px" } as CSSProperties}>
      <h2 style={{ margin: 0 }}>생성 중</h2>
      <div className="small" style={{ color: "var(--text-2)" }}>
        {stageText} · 경과 {elapsedSec}초
      </div>

      <div
        aria-label="생성 진행률"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={progressPct}
        style={{
          width: "100%",
          height: 8,
          background: "var(--surface-3, #eee)",
          borderRadius: 4,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            width: `${Math.min(100, Math.max(0, progressPct))}%`,
            height: "100%",
            background: "var(--accent, #3a7afe)",
            transition: "width 200ms linear",
          }}
        />
      </div>

      <ul className="small" style={{ margin: 0, paddingLeft: 18, color: "var(--text-2)" }}>
        <li>30초 이상 걸릴 수 있습니다. 페이지를 닫지 마세요.</li>
        <li>60초가 지나도 결과가 안 보이면 새로고침 또는 취소 후 모델을 바꿔 다시 시도하세요.</li>
      </ul>

      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={onCancel}
          disabled={cancelling}
        >
          {cancelling ? "취소 중…" : "취소"}
        </button>
      </div>
    </div>
  );
}
