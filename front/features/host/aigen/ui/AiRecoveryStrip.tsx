import type { CSSProperties } from "react";
import type { AiRecentJobResponse } from "@/features/host/aigen/api/aigen-contracts";

type AiRecoveryStripProps = {
  job: AiRecentJobResponse | null;
  loading?: boolean;
  onResumePolling: (jobId: string) => void;
  onCancel: (jobId: string) => void;
  onCommitRetry: (jobId: string) => void;
  onStartNew: () => void;
};

export function AiRecoveryStrip({
  job,
  loading = false,
  onResumePolling,
  onCancel,
  onCommitRetry,
  onStartNew,
}: AiRecoveryStripProps) {
  if (loading && !job) {
    return (
      <p className="small" style={{ color: "var(--text-2)", margin: 0 }}>
        AI 작업 상태를 확인하는 중입니다.
      </p>
    );
  }
  if (!job) return null;

  return (
    <div className="surface-quiet" style={{ padding: 14 }}>
      <div className="row-between" style={{ gap: 12, alignItems: "flex-start" }}>
        <div className="stack" style={{ "--stack": "6px" } as CSSProperties}>
          <span className="badge badge-dot">{job.status}</span>
          <p className="small" style={{ color: "var(--text-2)", margin: 0, overflowWrap: "anywhere" }}>
            {job.stage ?? "대기"} · {job.progressPct}% · {job.model}
          </p>
          {job.error ? (
            <p className="tiny" role="status" style={{ color: "var(--danger)", margin: 0, overflowWrap: "anywhere" }}>
              {job.error.code}: {job.error.message}
            </p>
          ) : null}
          <p className="tiny" style={{ color: "var(--text-3)", margin: 0 }}>
            만료 {formatCompactDate(job.expiresAt)}
          </p>
        </div>
        <div className="row" style={{ gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
          {job.availableActions.includes("POLL") ? (
            <button type="button" className="btn btn-quiet btn-sm" onClick={() => onResumePolling(job.jobId)}>
              Polling 재개
            </button>
          ) : null}
          {job.availableActions.includes("CANCEL") ? (
            <button type="button" className="btn btn-quiet btn-sm" onClick={() => onCancel(job.jobId)}>
              취소
            </button>
          ) : null}
          {job.availableActions.includes("COMMIT_RETRY") ? (
            <button type="button" className="btn btn-primary btn-sm" onClick={() => onCommitRetry(job.jobId)}>
              Commit 재시도
            </button>
          ) : null}
          {job.availableActions.includes("START_NEW") ? (
            <button type="button" className="btn btn-quiet btn-sm" onClick={onStartNew}>
              새로 시작
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function formatCompactDate(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return parsed.toLocaleString("ko-KR", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
