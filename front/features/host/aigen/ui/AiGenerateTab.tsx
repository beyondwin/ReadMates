/**
 * AiGenerateTab — top-level state machine for the AI session-generation flow
 * (design doc §10).
 *
 * Phases: IDLE → GENERATING → (PREVIEW | ERROR | IDLE on cancel) → COMMITTED.
 *
 * To avoid setState-in-effect cascades the phase is derived from a small
 * stage tag plus the polled `useAiGenerationJob` data. The PREVIEW snapshot
 * is kept in `editedSnapshot` (initialized lazily from the server result the
 * first time it arrives, then mutated by manual edits and regeneration).
 *
 * The parent (host session editor) renders this tab when the host selects
 * the "AI 결과 가져오기" mode; the mode toggle wiring lands in task_3_5.
 */

import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { useQuery } from "@tanstack/react-query";
import type {
  AiRecordVisibility,
  CommitGenerationRequest,
  SessionImportV1,
  StartGenerationRequest,
} from "@/features/host/aigen/api/aigen-contracts";
import {
  cancelGeneration,
  commitGeneration,
  getClubAiDefault,
  startGeneration,
} from "@/features/host/aigen/api/aigen-api";
import { useAiGenerationJob } from "@/features/host/aigen/hooks/useAiGenerationJob";
import {
  clearAigenDraft,
  loadAigenDraft,
  saveAigenDraft,
} from "@/features/host/aigen/storage/aigen-draft-storage";
import { TranscriptUploadForm } from "./TranscriptUploadForm";
import { GenerationProgressView } from "./GenerationProgressView";
import { PreviewView } from "./PreviewView";

type Stage =
  | { tag: "idle"; startError: string | null }
  | { tag: "active"; jobId: string; cancelling: boolean }
  | { tag: "committed" };

export type AiGenerateTabProps = {
  sessionId: string;
  clubSlug: string;
  onCommitted: () => void;
};

export function AiGenerateTab({ sessionId, clubSlug, onCommitted }: AiGenerateTabProps) {
  const [stage, setStage] = useState<Stage>({ tag: "idle", startError: null });
  const [recordVisibility, setRecordVisibility] = useState<AiRecordVisibility>("MEMBER");
  const [submittingStart, setSubmittingStart] = useState(false);
  const [editedSnapshot, setEditedSnapshot] = useState<SessionImportV1 | null>(null);
  const [committing, setCommitting] = useState(false);
  const [commitError, setCommitError] = useState<string | null>(null);
  // Track which jobId's result has already been adopted into editedSnapshot so
  // server overwrites don't clobber manual edits.
  const adoptedForJobRef = useRef<string | null>(null);

  const clubDefaultsQuery = useQuery({
    queryKey: ["host", "aigen", "club-ai-default", clubSlug],
    queryFn: () => getClubAiDefault(clubSlug),
  });
  const defaultModel = clubDefaultsQuery.data?.defaultModel ?? null;

  const activeJobId = stage.tag === "active" ? stage.jobId : null;
  const jobQuery = useAiGenerationJob(sessionId, activeJobId);
  const jobStatus = jobQuery.data?.status;

  // Adopt the server snapshot into edited state exactly once per jobId, on
  // first SUCCEEDED response. This is a one-shot sync, not a render-cascade.
  useEffect(() => {
    if (stage.tag !== "active") return;
    if (jobStatus !== "SUCCEEDED") return;
    const result = jobQuery.data?.result;
    if (!result) return;
    if (adoptedForJobRef.current === stage.jobId) return;
    adoptedForJobRef.current = stage.jobId;
    const draft = loadAigenDraft(stage.jobId);
    setEditedSnapshot(draft ?? result);
  }, [stage, jobStatus, jobQuery.data?.result]);

  // Reset to IDLE when poll reports CANCELLED. This is a legitimate
  // server-event → local-state synchronization; the alternative (rendering
  // null while keeping `stage.tag === "active"`) would be more confusing.
  useEffect(() => {
    if (stage.tag !== "active") return;
    if (jobStatus !== "CANCELLED") return;
    clearAigenDraft(stage.jobId);
    adoptedForJobRef.current = null;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- legitimate server-event → local-state sync
    setEditedSnapshot(null);
    setStage({ tag: "idle", startError: null });
  }, [stage, jobStatus]);

  // Persist edits to localStorage (draft storage).
  useEffect(() => {
    if (stage.tag !== "active") return;
    if (!editedSnapshot) return;
    saveAigenDraft(stage.jobId, editedSnapshot);
  }, [stage, editedSnapshot]);

  useEffect(() => {
    if (stage.tag !== "active") return;
    if (jobStatus !== "COMMITTED") return;
    clearAigenDraft(stage.jobId);
    adoptedForJobRef.current = null;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- legitimate server-event → local-state sync
    setEditedSnapshot(null);
    setStage({ tag: "committed" });
    onCommitted();
  }, [stage, jobStatus, onCommitted]);

  const handleStart = useCallback(
    async (payload: StartGenerationRequest) => {
      setSubmittingStart(true);
      setStage({ tag: "idle", startError: null });
      try {
        const response = await startGeneration(sessionId, payload);
        adoptedForJobRef.current = null;
        setEditedSnapshot(null);
        setCommitError(null);
        setStage({ tag: "active", jobId: response.jobId, cancelling: false });
      } catch (caught) {
        const message =
          caught instanceof Error ? caught.message : "생성 시작에 실패했습니다.";
        setStage({ tag: "idle", startError: message });
      } finally {
        setSubmittingStart(false);
      }
    },
    [sessionId],
  );

  const handleCancel = useCallback(async () => {
    if (stage.tag !== "active") return;
    const jobId = stage.jobId;
    setStage({ tag: "active", jobId, cancelling: true });
    try {
      await cancelGeneration(sessionId, jobId);
    } catch {
      // Surface no error — UX is to return to IDLE either way.
    }
    clearAigenDraft(jobId);
    adoptedForJobRef.current = null;
    setEditedSnapshot(null);
    setStage({ tag: "idle", startError: null });
  }, [sessionId, stage]);

  const handleSnapshotChange = useCallback((next: SessionImportV1) => {
    setCommitError(null);
    setEditedSnapshot(next);
  }, []);

  const handleCommit = useCallback(async () => {
    if (stage.tag !== "active" || !editedSnapshot) return;
    setCommitting(true);
    setCommitError(null);
    try {
      const request: CommitGenerationRequest = {
        recordVisibility,
        result: editedSnapshot,
      };
      await commitGeneration(sessionId, stage.jobId, request);
      clearAigenDraft(stage.jobId);
      adoptedForJobRef.current = null;
      setStage({ tag: "committed" });
      onCommitted();
    } catch (caught) {
      const message =
        caught instanceof Error ? caught.message : "기록 저장에 실패했습니다.";
      setCommitError(message);
    } finally {
      setCommitting(false);
    }
  }, [stage, editedSnapshot, recordVisibility, sessionId, onCommitted]);

  const handleRetry = useCallback(() => {
    setStage({ tag: "idle", startError: null });
    setEditedSnapshot(null);
    setCommitError(null);
  }, []);

  // ─── Derived render phase ──────────────────────────────────────────────
  if (stage.tag === "committed") {
    return (
      <div className="small" role="status">
        AI 기록 저장을 완료했습니다.
      </div>
    );
  }

  if (stage.tag === "active") {
    if (jobStatus === "COMMITTING") {
      return (
        <div className="small" role="status">
          AI 기록을 저장하는 중입니다.
        </div>
      );
    }
    if (jobStatus === "FAILED") {
      const message = jobQuery.data?.error?.message ?? "AI 생성에 실패했습니다.";
      return <ErrorState message={message} onRetry={handleRetry} />;
    }
    if (jobStatus === "SUCCEEDED" && editedSnapshot) {
      return (
        <PreviewView
          sessionId={sessionId}
          jobId={stage.jobId}
          snapshot={editedSnapshot}
          recordVisibility={recordVisibility}
          committing={committing}
          commitError={commitError}
          onSnapshotChange={handleSnapshotChange}
          onVisibilityChange={setRecordVisibility}
          onCommit={handleCommit}
        />
      );
    }
    return (
      <GenerationProgressView
        job={jobQuery.data}
        cancelling={stage.cancelling}
        onCancel={handleCancel}
      />
    );
  }

  if (clubDefaultsQuery.isError) {
    return (
      <div className="stack" style={{ "--stack": "8px" } as CSSProperties}>
        <p className="small" role="status" style={{ color: "var(--text-2)", margin: 0 }}>
          AI 생성을 사용할 수 없습니다. 외부 JSON 가져오기로 세션 기록을 저장할 수 있습니다.
        </p>
        <p className="tiny" style={{ color: "var(--text-3)", margin: 0 }}>
          모델 설정, provider 상태, 비용 한도, 운영 kill switch를 확인하세요.
        </p>
      </div>
    );
  }

  return (
    <div className="stack" style={{ "--stack": "12px" } as CSSProperties}>
      <TranscriptUploadForm
        defaultModel={defaultModel}
        loadingDefaults={clubDefaultsQuery.isLoading}
        submitting={submittingStart}
        onSubmit={handleStart}
      />
      {stage.startError ? (
        <div className="small" role="alert" style={{ color: "var(--danger)" }}>
          {stage.startError}
        </div>
      ) : null}
    </div>
  );
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="stack" style={{ "--stack": "12px" } as CSSProperties}>
      <h2 style={{ margin: 0 }}>AI 생성 실패</h2>
      <p className="small" role="alert" style={{ color: "var(--danger)" }}>
        {message}
      </p>
      <p className="small" style={{ color: "var(--text-2)" }}>
        다시 시도하거나, 모델을 바꿔 새로 생성해 보세요.
      </p>
      <div>
        <button type="button" className="btn btn-primary btn-sm" onClick={onRetry}>
          다시 시도
        </button>
      </div>
    </div>
  );
}
