import type { ChangeEvent, JSX, ReactNode } from "react";
import type { AiCommitResponse } from "@/features/host/aigen/model/aigen-presentation-types";
import type { HostSessionDraftSource } from "@/features/host/model/host-session-workspace-navigation";
import type {
  SessionImportPreviewResponse,
  SessionRecordVisibility,
} from "@/features/host/model/host-view-types";
import { SessionImportPanelBody } from "./session-import-panel";

export type SessionRecordCompletionMode = Exclude<HostSessionDraftSource, "manual">;
export type AiGenerateCommitResult = AiCommitResponse | null;

export type AiGenerationPanelRenderer = (input: {
  sessionId: string;
  clubSlug: string;
  expectedDraftRevision: number | null;
  onCommitted: (result: AiGenerateCommitResult) => void | Promise<void>;
}) => ReactNode;

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
  onSetGuestReadable?: () => void | Promise<void>;
  renderAiGeneration?: AiGenerationPanelRenderer;
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
  onSetGuestReadable,
  renderAiGeneration,
}: SessionRecordCompletionPanelProps): JSX.Element {
  if (mode === "ai") {
    if (!canUseAigen || !sessionId || !clubSlug) {
      return (
        <p className="small" style={{ margin: 0, color: "var(--text-2)" }}>
          AI 생성은 모임 저장 후 사용할 수 있습니다. 외부 JSON은 계속 사용할 수 있습니다.
        </p>
      );
    }

    return <>{renderAiGeneration?.({ sessionId, clubSlug, expectedDraftRevision, onCommitted: onAigenCommitted }) ?? <p role="status">AI 기록 도구를 준비하지 못했습니다.</p>}</>;
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
      onSetGuestReadable={onSetGuestReadable}
    />
  );
}
