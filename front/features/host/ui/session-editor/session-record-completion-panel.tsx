import { lazy, Suspense, type ChangeEvent, type JSX } from "react";
import type { AiCommitResponse } from "@/features/host/aigen/api/aigen-contracts";
import type { HostSessionDraftSource } from "@/features/host/model/host-session-editor-navigation";
import type {
  SessionImportPreviewResponse,
  SessionRecordVisibility,
} from "@/features/host/model/host-view-types";
import { SessionImportPanelBody } from "./session-import-panel";

export type SessionRecordCompletionMode = Exclude<HostSessionDraftSource, "manual">;
export type AiGenerateCommitResult = AiCommitResponse | null;

const AiGenerateTab = lazy(async () => {
  const module = await import("@/features/host/aigen/ui/AiGenerateTab");
  return { default: module.AiGenerateTab };
});

type SessionRecordCompletionPanelProps = {
  sessionId: string | undefined;
  clubSlug: string | undefined;
  mode: SessionRecordCompletionMode;
  canUseAigen: boolean;
  recordVisibility: SessionRecordVisibility;
  preview: SessionImportPreviewResponse | null;
  status: "idle" | "previewing" | "ready" | "committing" | "error";
  error: string | null;
  expectedDraftRevision: number | null;
  onAigenCommitted: (result: AiGenerateCommitResult) => void | Promise<void>;
  onFileSelected: (event: ChangeEvent<HTMLInputElement>) => void;
  onCommit: () => void;
};

export function SessionRecordCompletionPanel({
  sessionId,
  clubSlug,
  mode,
  canUseAigen,
  recordVisibility,
  preview,
  status,
  error,
  expectedDraftRevision,
  onAigenCommitted,
  onFileSelected,
  onCommit,
}: SessionRecordCompletionPanelProps): JSX.Element {
  if (mode === "ai") {
    if (!canUseAigen || !sessionId || !clubSlug) {
      return (
        <p className="small" style={{ margin: 0, color: "var(--text-2)" }}>
          AI 생성은 세션 저장 후 사용할 수 있습니다. 외부 JSON은 계속 사용할 수 있습니다.
        </p>
      );
    }

    return (
      <Suspense fallback={<p role="status">AI 기록 도구를 불러오는 중입니다.</p>}>
        <AiGenerateTab
          sessionId={sessionId}
          clubSlug={clubSlug}
          expectedDraftRevision={expectedDraftRevision}
          onCommitted={onAigenCommitted}
        />
      </Suspense>
    );
  }

  return (
    <SessionImportPanelBody
      sessionId={sessionId}
      recordVisibility={recordVisibility}
      preview={preview}
      status={status}
      error={error}
      onFileSelected={onFileSelected}
      onCommit={onCommit}
    />
  );
}
