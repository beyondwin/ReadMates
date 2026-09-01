import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { useQuery } from "@tanstack/react-query";
import type {
  AiCommitResponse,
  AiEvidenceExcerpt,
  AiGenerationJobResponse,
  AiGenerationProblem,
  AiRecordVisibility,
  CommitGenerationRequest,
  RegenerateResponse,
  ReviewSection,
  SessionImportV1,
  StartGenerationRequest,
} from "@/features/host/aigen/api/aigen-contracts";
import { AiGenerationApiError, expandEvidence, regenerateItem } from "@/features/host/aigen/api/aigen-api";
import { useAiGenerationJob } from "@/features/host/aigen/hooks/useAiGenerationJob";
import {
  REVIEW_SECTIONS,
  applySectionEdit,
  createReviewState,
  resetReviewStateForRevision,
  toCommitSectionReviews,
  type AiGenerationReviewState,
} from "@/features/host/aigen/model/aigen-review-state";
import {
  availableAiModelsQuery,
  recentAiJobQuery,
  useCancelAiJobMutation,
  useCommitAiJobMutation,
  useStartAiJobMutation,
} from "@/features/host/aigen/queries/aigen-job-queries";
import {
  clearAigenDraft,
  loadAigenDraft,
  purgeAigenDrafts,
  saveAigenDraft,
  type AiGenerationDraftEnvelope,
} from "@/features/host/aigen/storage/aigen-draft-storage";
import { registerHostSensitiveState } from "@/features/host/storage/host-sensitive-storage";
import { AiRecoveryStrip } from "@/features/host/aigen/ui/AiRecoveryStrip";
import { GenerationProgressView } from "@/features/host/aigen/ui/GenerationProgressView";
import { PreviewView } from "@/features/host/aigen/ui/PreviewView";
import { TranscriptUploadForm } from "@/features/host/aigen/ui/TranscriptUploadForm";
import {
  isTransitionOwnerObsoleteError,
  publishTransitionAction,
  TransitionOwnerObsoleteError,
  useTransitionSafetyOwner,
} from "@/shared/ui/use-transition-safety-owner";

type Stage =
  | { tag: "idle"; startError: AiGenerationProblem | null }
  | { tag: "active"; jobId: string; cancelling: boolean }
  | { tag: "committed"; result: AiCommitResponse | null };

export type AiGenerateControllerProps = {
  sessionId: string;
  clubSlug: string;
  expectedDraftRevision?: number | null;
  onCommitted: (result: AiCommitResponse | null) => void;
};

function sectionEvidence(evidence: AiEvidenceExcerpt[], section: ReviewSection) {
  const targets = new Map<string, number>();
  for (const item of evidence) {
    if (item.section === section) targets.set(item.targetId, item.ordinal);
  }
  return [...targets.entries()]
    .sort((left, right) => left[1] - right[1])
    .map(([targetId]) => targetId);
}

function summaryBlocks(value: string): string[] {
  return value.split("\n\n");
}

function feedbackBlocks(value: string): string[] | null {
  const headings = ["관찰자 노트", "참여자별 피드백"];
  const lines = value.split("\n");
  const result: string[] = [];
  for (const heading of headings) {
    const start = lines.findIndex((line) => line === `## ${heading}`);
    if (start < 0) return null;
    let end = lines.length;
    for (let index = start + 1; index < lines.length; index++) {
      if (lines[index]?.startsWith("## ")) { end = index; break; }
    }
    result.push(lines.slice(start, end).join("\n"));
  }
  return result;
}

function sectionEditDetails(
  section: ReviewSection,
  server: SessionImportV1,
  draft: SessionImportV1,
  evidence: AiEvidenceExcerpt[],
) {
  const sectionTargetIds = sectionEvidence(evidence, section);
  let changedTargetIds: string[] = [];
  let mappingAmbiguous: boolean;
  if (section === "SUMMARY") {
    const before = summaryBlocks(server.summary);
    const after = summaryBlocks(draft.summary);
    mappingAmbiguous = before.length !== after.length || before.length !== sectionTargetIds.length;
    if (!mappingAmbiguous) {
      changedTargetIds = sectionTargetIds.filter((_, index) => before[index] !== after[index]);
    }
  } else if (section === "HIGHLIGHTS" || section === "ONE_LINE_REVIEWS") {
    const before = section === "HIGHLIGHTS" ? server.highlights : server.oneLineReviews;
    const after = section === "HIGHLIGHTS" ? draft.highlights : draft.oneLineReviews;
    mappingAmbiguous = before.length !== after.length || before.length !== sectionTargetIds.length;
    if (!mappingAmbiguous) {
      changedTargetIds = sectionTargetIds.filter(
        (_, index) =>
          before[index]?.authorName !== after[index]?.authorName ||
          before[index]?.text !== after[index]?.text,
      );
    }
  } else {
    const before = feedbackBlocks(server.feedbackDocumentMarkdown);
    const after = feedbackBlocks(draft.feedbackDocumentMarkdown);
    mappingAmbiguous =
      server.feedbackDocumentFileName !== draft.feedbackDocumentFileName ||
      before === null ||
      after === null ||
      before.length !== sectionTargetIds.length ||
      after.length !== sectionTargetIds.length;
    if (!mappingAmbiguous && before && after) {
      changedTargetIds = sectionTargetIds.filter((_, index) => before[index] !== after[index]);
      if (
        server.feedbackDocumentMarkdown !== draft.feedbackDocumentMarkdown &&
        changedTargetIds.length === 0
      ) {
        mappingAmbiguous = true;
      }
    }
  }
  return { sectionTargetIds, changedTargetIds, mappingAmbiguous };
}

function restoredReviewState(
  revision: number,
  server: SessionImportV1,
  draft: SessionImportV1,
  evidence: AiEvidenceExcerpt[],
  stored: ReturnType<typeof loadAigenDraft>,
): AiGenerationReviewState {
  let state = createReviewState(revision);
  if (stored) state = { ...state, sectionReviews: stored.sectionReviews };
  for (const section of REVIEW_SECTIONS) {
    state = applySectionEdit(state, {
      section,
      serverSnapshot: server,
      draft,
      ...sectionEditDetails(section, server, draft, evidence),
    });
    if (stored && state.sectionReviews[section] === "USER_EDITED_REVIEW_REQUIRED" && stored.sectionReviews[section] === "USER_EDITED_CONFIRMED") {
      state = {
        ...state,
        sectionReviews: { ...state.sectionReviews, [section]: "USER_EDITED_CONFIRMED" },
      };
    } else if (stored && state.sectionReviews[section] === "PENDING" && stored.sectionReviews[section] === "AI_GROUNDED_REVIEWED") {
      state = {
        ...state,
        sectionReviews: { ...state.sectionReviews, [section]: "AI_GROUNDED_REVIEWED" },
      };
    }
  }
  return state;
}

export function AiGenerateController({
  sessionId,
  clubSlug,
  expectedDraftRevision = null,
  onCommitted,
}: AiGenerateControllerProps) {
  const [stage, setStage] = useState<Stage>({ tag: "idle", startError: null });
  const [recordVisibility, setRecordVisibility] = useState<AiRecordVisibility>("MEMBER");
  const [submittingStart, setSubmittingStart] = useState(false);
  const [serverSnapshot, setServerSnapshot] = useState<SessionImportV1 | null>(null);
  const [editedSnapshot, setEditedSnapshot] = useState<SessionImportV1 | null>(null);
  const [evidence, setEvidence] = useState<AiEvidenceExcerpt[]>([]);
  const [reviewState, setReviewState] = useState<AiGenerationReviewState | null>(null);
  const [storageWarning, setStorageWarning] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [commitError, setCommitError] = useState<string | null>(null);
  const [revisionConflict, setRevisionConflict] = useState<AiGenerationProblem | null>(null);
  const draftDirty = serverSnapshot !== null && editedSnapshot !== null
    && JSON.stringify(serverSnapshot) !== JSON.stringify(editedSnapshot);
  const transitionOwner = useTransitionSafetyOwner("host-ai-generation", draftDirty, "저장하지 않은 AI 기록 초안이 있습니다.");
  const adoptedRevisionRef = useRef<string | null>(null);
  const pendingDraftRef = useRef<AiGenerationDraftEnvelope | null>(null);
  const draftTimerRef = useRef<number | null>(null);

  const context = { clubSlug };
  const modelsQuery = useQuery(availableAiModelsQuery(sessionId, context));
  const activeJobId = stage.tag === "active" ? stage.jobId : null;
  const startMutation = useStartAiJobMutation(sessionId, context);
  const cancelMutation = useCancelAiJobMutation(sessionId, context);
  const commitMutation = useCommitAiJobMutation(sessionId, activeJobId ?? "", context);
  const recentJobQuery = useQuery({ ...recentAiJobQuery(sessionId, context), enabled: stage.tag === "idle" });
  const jobQuery = useAiGenerationJob(sessionId, activeJobId, { context });
  const jobStatus = jobQuery.data?.status;
  const jobProblemCode = jobQuery.error instanceof AiGenerationApiError
    ? jobQuery.error.problem.code
    : null;

  const discardPendingDraft = useCallback(() => {
    pendingDraftRef.current = null;
    if (draftTimerRef.current !== null) {
      window.clearTimeout(draftTimerRef.current);
      draftTimerRef.current = null;
    }
  }, []);

  const flushPendingDraft = useCallback((updateWarning: boolean) => {
    if (draftTimerRef.current !== null) {
      window.clearTimeout(draftTimerRef.current);
      draftTimerRef.current = null;
    }
    const pending = pendingDraftRef.current;
    if (!pending) return;
    pendingDraftRef.current = null;
    const saved = saveAigenDraft(pending);
    if (updateWarning) {
      setStorageWarning((current) => current === !saved ? current : !saved);
    }
  }, []);

  const clearWorkspace = useCallback(() => {
    setServerSnapshot(null);
    setEditedSnapshot(null);
    setEvidence([]);
    setReviewState(null);
    setStorageWarning(false);
    setCommitError(null);
    setRevisionConflict(null);
  }, []);

  const adoptJob = useCallback((jobId: string, data: AiGenerationJobResponse) => {
    if (data.status !== "SUCCEEDED" || !data.result) return false;
    const grounded = typeof data.revision === "number" && data.groundingStatus === "VALID" && Array.isArray(data.evidence);
    const revision = grounded ? data.revision as number : 0;
    const restored = loadAigenDraft(clubSlug, jobId, revision);
    const draft = restored?.draft ?? data.result;
    const currentEvidence = grounded ? data.evidence ?? [] : [];
    setServerSnapshot(data.result);
    setEditedSnapshot(draft);
    setEvidence(currentEvidence);
    setReviewState(restoredReviewState(revision, data.result, draft, currentEvidence, restored));
    setRevisionConflict(null);
    adoptedRevisionRef.current = `${jobId}:${revision}`;
    return true;
  }, [clubSlug]);

  useEffect(() => {
    if (stage.tag !== "active" || jobStatus !== "SUCCEEDED" || !jobQuery.data) return;
    const revision = typeof jobQuery.data.revision === "number" ? jobQuery.data.revision : 0;
    if (adoptedRevisionRef.current === `${stage.jobId}:${revision}`) return;
    adoptJob(stage.jobId, jobQuery.data);
  }, [stage, jobStatus, jobQuery.data, adoptJob]);

  useEffect(() => {
    if (stage.tag !== "active" || jobStatus !== "CANCELLED") return;
    discardPendingDraft();
    clearAigenDraft(clubSlug, stage.jobId);
    adoptedRevisionRef.current = null;
    clearWorkspace();
    setStage({ tag: "idle", startError: null });
  }, [clubSlug, stage, jobStatus, clearWorkspace, discardPendingDraft]);

  useEffect(() => {
    if (stage.tag !== "active" || !serverSnapshot || !editedSnapshot || !reviewState) return;
    pendingDraftRef.current = {
      version: 2,
      clubSlug,
      jobId: stage.jobId,
      revision: reviewState.revision,
      serverSnapshot,
      draft: editedSnapshot,
      sectionReviews: reviewState.sectionReviews,
    };
    if (draftTimerRef.current !== null) window.clearTimeout(draftTimerRef.current);
    draftTimerRef.current = window.setTimeout(() => flushPendingDraft(true), 250);
  }, [clubSlug, stage, serverSnapshot, editedSnapshot, reviewState, flushPendingDraft]);

  useEffect(() => registerHostSensitiveState({
    clubSlug,
    resourceKey: `ai-draft:${sessionId}`,
    clear: () => {
      discardPendingDraft();
      clearWorkspace();
    },
  }), [clubSlug, sessionId, clearWorkspace, discardPendingDraft]);

  useEffect(() => {
    const handlePageHide = () => flushPendingDraft(false);
    window.addEventListener("pagehide", handlePageHide);
    return () => {
      window.removeEventListener("pagehide", handlePageHide);
      flushPendingDraft(false);
    };
  }, [flushPendingDraft]);

  useEffect(() => {
    if (
      stage.tag !== "active" ||
      (jobStatus !== "FAILED" && jobProblemCode !== "JOB_EXPIRED")
    ) return;
    discardPendingDraft();
    clearAigenDraft(clubSlug, stage.jobId);
  }, [clubSlug, stage, jobStatus, jobProblemCode, discardPendingDraft]);

  useEffect(() => {
    if (stage.tag !== "active" || jobStatus !== "COMMITTED") return;
    discardPendingDraft();
    clearAigenDraft(clubSlug, stage.jobId);
    adoptedRevisionRef.current = null;
    clearWorkspace();
    setStage({ tag: "committed", result: null });
    onCommitted(null);
  }, [clubSlug, stage, jobStatus, onCommitted, clearWorkspace, discardPendingDraft]);

  const handleStart = useCallback(async (payload: StartGenerationRequest) => {
    setSubmittingStart(true);
    setStage({ tag: "idle", startError: null });
    const operationId = `ai-start-${globalThis.crypto.randomUUID()}`;
    const handle = transitionOwner.begin(operationId, "L3", async () => ({ operationId, outcome: "still-unknown" }));
    try {
      const response = await startMutation.mutateAsync(payload);
      if (await handle.settle("succeeded") !== "accepted") return;
      await publishTransitionAction(handle, "sessionStorage", () => purgeAigenDrafts(clubSlug, response.jobId));
      await publishTransitionAction(handle, "ui", () => {
        adoptedRevisionRef.current = null;
        clearWorkspace();
        setStage({ tag: "active", jobId: response.jobId, cancelling: false });
        setSubmittingStart(false);
      });
    } catch (caught) {
      if (await handle.settle("failed") !== "accepted") return;
      const problem = caught instanceof AiGenerationApiError
        ? caught.problem
        : { code: "AI_GENERATION_REQUEST_FAILED", detail: "생성 시작에 실패했습니다." };
      await publishTransitionAction(handle, "errorCopy", () => {
        setStage({ tag: "idle", startError: problem });
        setSubmittingStart(false);
      });
    } finally {
      // Accepted success/error branches own their own final UI publication.
    }
  }, [clubSlug, startMutation, clearWorkspace, transitionOwner]);

  const handleCancelJob = useCallback(async (jobId: string) => {
    setStage({ tag: "active", jobId, cancelling: true });
    const operationId = `ai-cancel-${jobId}`;
    const handle = transitionOwner.begin(operationId, "L3", async () => ({ operationId, outcome: "still-unknown" }));
    try {
      await cancelMutation.mutateAsync(jobId);
      if (await handle.settle("succeeded") !== "accepted") return;
      await publishTransitionAction(handle, "sessionStorage", () => {
        discardPendingDraft();
        clearAigenDraft(clubSlug, jobId);
      });
      await publishTransitionAction(handle, "ui", () => {
        adoptedRevisionRef.current = null;
        clearWorkspace();
        setStage({ tag: "idle", startError: null });
      });
    } catch {
      if (await handle.settle("failed") !== "accepted") return;
      await publishTransitionAction(handle, "errorCopy", () => {
        setStage({ tag: "active", jobId, cancelling: false });
      });
    }
  }, [clubSlug, cancelMutation, clearWorkspace, discardPendingDraft, transitionOwner]);

  const handleSnapshotChange = useCallback((next: SessionImportV1, section?: ReviewSection) => {
    setCommitError(null);
    setRevisionConflict(null);
    setEditedSnapshot(next);
    if (!section || !serverSnapshot) return;
    setReviewState((current) => current ? applySectionEdit(current, {
      section,
      serverSnapshot,
      draft: next,
      ...sectionEditDetails(section, serverSnapshot, next, evidence),
    }) : current);
  }, [serverSnapshot, evidence]);

  const handleRegenerated = useCallback((response: RegenerateResponse) => {
    const revision = response.revision;
    if (
      !reviewState ||
      typeof revision !== "number" ||
      revision <= reviewState.revision ||
      !response.result ||
      !Array.isArray(response.evidence)
    ) {
      setCommitError("최신 revision의 완전한 재생성 결과를 확인하지 못했습니다.");
      return;
    }
    setServerSnapshot(response.result);
    setEditedSnapshot(response.result);
    setEvidence(response.evidence);
    setReviewState(resetReviewStateForRevision(reviewState, revision));
    setRevisionConflict(null);
    setCommitError(null);
  }, [reviewState]);

  const handleCommit = useCallback(async () => {
    if (stage.tag !== "active" || !editedSnapshot) return;
    const grounded = reviewState && reviewState.revision > 0 && serverSnapshot;
    const sectionReviews = grounded
      ? toCommitSectionReviews(reviewState, serverSnapshot, editedSnapshot)
      : null;
    if (grounded && !sectionReviews) return;
    setCommitting(true);
    setCommitError(null);
    setRevisionConflict(null);
    const operationId = `ai-commit-${stage.jobId}`;
    const handle = transitionOwner.begin(operationId, "L3", async () => ({ operationId, outcome: "still-unknown" }));
    try {
      const request: CommitGenerationRequest = {
        recordVisibility,
        expectedDraftRevision,
        result: editedSnapshot,
        ...(grounded ? { expectedRevision: reviewState.revision, sectionReviews: sectionReviews! } : {}),
      };
      const result = await commitMutation.mutateAsync(request);
      if (await handle.settle("succeeded") !== "accepted") return;
      await publishTransitionAction(handle, "sessionStorage", () => {
        discardPendingDraft();
        clearAigenDraft(clubSlug, stage.jobId);
      });
      await publishTransitionAction(handle, "ui", () => {
        adoptedRevisionRef.current = null;
        clearWorkspace();
        setStage({ tag: "committed", result });
        setCommitting(false);
      });
      await publishTransitionAction(handle, "receiptCallback", () => onCommitted(result));
    } catch (caught) {
      if (await handle.settle("failed") !== "accepted") return;
      await publishTransitionAction(handle, "errorCopy", () => {
        if (caught instanceof AiGenerationApiError && caught.status === 409) {
          setRevisionConflict(caught.problem);
        } else {
          setCommitError(caught instanceof Error ? caught.message : "기록 저장에 실패했습니다.");
        }
        setCommitting(false);
      });
      if (caught instanceof AiGenerationApiError && caught.status === 409) {
        await publishTransitionAction(handle, "cache", () => jobQuery.refetch());
      }
    } finally {
      // Accepted success/error branches own their own final UI publication.
    }
  }, [clubSlug, stage, editedSnapshot, reviewState, serverSnapshot, recordVisibility, expectedDraftRevision, commitMutation, onCommitted, clearWorkspace, jobQuery, discardPendingDraft, transitionOwner]);

  const handleReloadRevision = useCallback(async () => {
    if (stage.tag !== "active") return;
    const refreshed = await jobQuery.refetch();
    if (refreshed.data) adoptJob(stage.jobId, refreshed.data);
  }, [stage, jobQuery, adoptJob]);

  const handleRetry = useCallback(() => {
    setStage({ tag: "idle", startError: null });
    clearWorkspace();
  }, [clearWorkspace]);

  if (stage.tag === "committed") {
    const count = stage.result?.participantUpdatesCount;
    return (
      <div className="small" role="status">
        AI 기록을 공유 초안으로 저장했습니다. 알림은 생성되지 않습니다. {typeof count === "number" ? `참여 상태 ${count}건을 확인했습니다.` : "검토 후 반영할 수 있습니다."}
      </div>
    );
  }

  if (stage.tag === "active") {
    if (jobStatus === "COMMITTING") return <div className="small" role="status">AI 기록을 초안으로 저장하는 중입니다.</div>;
    if (jobStatus === "COMMIT_RETRY") {
      return <div className="stack" style={{ "--stack": "8px" } as CSSProperties} role="status"><h2 style={{ margin: 0 }}>커밋 확인 중</h2><p className="small" style={{ color: "var(--text-2)", margin: 0 }}>기록 저장 영수증과 참여 상태 동기화를 확인하고 있습니다. 페이지를 유지하면 안전하게 다시 확인합니다.</p></div>;
    }
    if (jobStatus === "FAILED") return <ErrorState message={jobQuery.data?.error?.message ?? "AI 생성에 실패했습니다."} onRetry={handleRetry} />;
    if (jobStatus === "SUCCEEDED" && editedSnapshot) {
      const grounded = reviewState !== null && reviewState.revision > 0 && serverSnapshot !== null;
      const commitEnabled = grounded
        ? toCommitSectionReviews(reviewState, serverSnapshot, editedSnapshot) !== null
        : true;
      return (
        <PreviewView
          clubSlug={clubSlug}
          sessionId={sessionId}
          jobId={stage.jobId}
          snapshot={editedSnapshot}
          recordVisibility={recordVisibility}
          committing={committing}
          commitError={commitError}
          models={modelsQuery.data?.models ?? []}
          revision={grounded ? reviewState.revision : undefined}
          serverSnapshot={grounded ? serverSnapshot : undefined}
          evidence={grounded ? evidence : undefined}
          reviewState={grounded ? reviewState : undefined}
          storageWarning={storageWarning}
          revisionConflict={revisionConflict}
          commitEnabled={commitEnabled}
          onSnapshotChange={handleSnapshotChange}
          onReviewStateChange={setReviewState}
          onRegenerated={handleRegenerated}
          onRegenerate={async (request) => {
            const operationId = `ai-regenerate-${stage.jobId}-${globalThis.crypto.randomUUID()}`;
            const handle = transitionOwner.begin(operationId, "L3", async () => ({ operationId, outcome: "still-unknown" }));
            try {
              const response = await regenerateItem(sessionId, stage.jobId, request, context);
              if (await handle.settle("succeeded") !== "accepted") throw new TransitionOwnerObsoleteError();
              return await publishTransitionAction(handle, "ui", () => response);
            } catch (error) {
              if (isTransitionOwnerObsoleteError(error)) throw error;
              await handle.settle("failed");
              throw error;
            }
          }}
          onExpandEvidence={(turnId, revision) =>
            expandEvidence(sessionId, stage.jobId, turnId, revision, context)}
          onReloadRevision={handleReloadRevision}
          onVisibilityChange={setRecordVisibility}
          onCommit={handleCommit}
        />
      );
    }
    return <GenerationProgressView job={jobQuery.data} cancelling={stage.cancelling} onCancel={() => void handleCancelJob(stage.jobId)} />;
  }

  return (
    <div className="stack" style={{ "--stack": "12px" } as CSSProperties}>
      <AiRecoveryStrip job={recentJobQuery.data ?? null} loading={recentJobQuery.isLoading} onResumePolling={(jobId) => setStage({ tag: "active", jobId, cancelling: false })} onCancel={handleCancelJob} onCommitRetry={(jobId) => setStage({ tag: "active", jobId, cancelling: false })} onStartNew={handleRetry} />
      <TranscriptUploadForm models={modelsQuery.data?.models ?? []} loadingModels={modelsQuery.isLoading} modelError={modelsQuery.isError} startProblem={stage.startError} submitting={submittingStart} onRetryModels={() => void modelsQuery.refetch()} onSubmit={handleStart} />
    </div>
  );
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return <div className="stack" style={{ "--stack": "12px" } as CSSProperties}><h2 style={{ margin: 0 }}>AI 생성 실패</h2><p className="small" role="alert" style={{ color: "var(--danger)" }}>{message}</p><p className="small" style={{ color: "var(--text-2)" }}>다시 시도하거나, 모델을 바꿔 새로 생성해 보세요.</p><div><button type="button" className="btn btn-primary btn-sm" onClick={onRetry}>다시 시도</button></div></div>;
}
