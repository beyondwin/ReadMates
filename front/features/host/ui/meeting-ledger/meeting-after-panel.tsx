import { type ChangeEvent, type CSSProperties, useId, useState } from "react";
import type { SessionAccessScope } from "@/features/host/model/session-exposure-model";
import type {
  SessionImportPreviewResponse,
  SessionRecordVisibility,
} from "@/features/host/model/host-view-types";
import { SessionImportPanelBody } from "../session-editor/session-import-panel";
import {
  SessionRecordApplyDialog,
  type HostSessionRecordApplyReview,
} from "../session-editor/session-record-apply-dialog";

export type MeetingAfterPanelApplyReview = {
  open: boolean;
  preview: HostSessionRecordApplyReview | null;
  submitting: boolean;
};

export type MeetingAfterPanelProps = {
  state: "CLOSED" | "PUBLISHED";
  summary: string;
  accessScope: SessionAccessScope;
  sessionId?: string;
  recordVisibility?: SessionRecordVisibility;
  lifecyclePending?: boolean;
  reverseLabel?: string;
  canUseAi?: boolean;
  importPreview?: SessionImportPreviewResponse | null;
  importStatus?: "idle" | "previewing" | "ready" | "committing" | "error";
  importError?: string | null;
  applyReview?: MeetingAfterPanelApplyReview;
  onEditAttendance?: () => void;
  onPublish?: () => void;
  onReverse?: () => void;
  onFileSelected?: (event: ChangeEvent<HTMLInputElement>) => void;
  onImportCommit?: () => void;
  onSetGuestReadable?: () => void | Promise<void>;
  onConfirmApply?: () => void;
  onDismissApply?: () => void;
  onOpenAi?: () => void;
};

const SUMMARY_PUBLISH_REASON = "공개하려면 요약이 필요합니다";
const HOST_ONLY_PUBLISH_REASON = "공개하려면 게스트와 멤버에게 보이기로 바꿔 주세요.";

function publishBlockedReason(accessScope: SessionAccessScope, summary: string) {
  if (accessScope === "HOST_ONLY") {
    return HOST_ONLY_PUBLISH_REASON;
  }
  if (summary.trim().length === 0) {
    return SUMMARY_PUBLISH_REASON;
  }
  return null;
}

function ignoreFileSelected() {}
function ignoreCommit() {}

export function MeetingAfterPanel({
  state,
  summary,
  accessScope,
  sessionId,
  recordVisibility = "HOST_ONLY",
  lifecyclePending = false,
  reverseLabel,
  canUseAi = false,
  importPreview = null,
  importStatus = "idle",
  importError = null,
  applyReview,
  onEditAttendance,
  onPublish,
  onReverse,
  onFileSelected = ignoreFileSelected,
  onImportCommit = ignoreCommit,
  onSetGuestReadable,
  onConfirmApply,
  onDismissApply,
  onOpenAi,
}: MeetingAfterPanelProps) {
  const [wrapUpOpen, setWrapUpOpen] = useState(false);
  const [otherMethodsOpen, setOtherMethodsOpen] = useState(false);
  const otherMethodsId = useId();
  const publishReasonId = useId();
  const canPublish = state === "CLOSED"
    && Boolean(onPublish)
    && accessScope === "GUEST_READABLE"
    && summary.trim().length > 0;
  const showPublish = state === "CLOSED";
  const blockedReason = showPublish && !canPublish
    ? publishBlockedReason(accessScope, summary)
    : null;
  const showOtherMethods = canUseAi && Boolean(onOpenAi);

  return (
    <section className="rm-meeting-after-panel stack" style={{ "--stack": "16px" } as CSSProperties}>
      <div className="rm-meeting-after-panel__actions" style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        <button
          type="button"
          className="btn btn-quiet btn-sm"
          disabled={lifecyclePending}
          onClick={() => onEditAttendance?.()}
        >
          출석 수정
        </button>
        <button
          type="button"
          className="btn btn-primary btn-sm"
          disabled={lifecyclePending}
          aria-expanded={wrapUpOpen}
          onClick={() => setWrapUpOpen(true)}
        >
          정리본 올리기
        </button>
        {showPublish ? (
          <button
            type="button"
            className="btn btn-primary btn-sm"
            disabled={lifecyclePending || !canPublish}
            aria-describedby={blockedReason ? publishReasonId : undefined}
            onClick={() => onPublish?.()}
          >
            기록 공개
          </button>
        ) : null}
      </div>
      {blockedReason ? (
        <p id={publishReasonId} className="small" style={{ margin: 0, color: "var(--text-2)" }}>
          {blockedReason}
        </p>
      ) : null}
      {reverseLabel && onReverse ? (
        <div>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            disabled={lifecyclePending}
            onClick={onReverse}
          >
            {reverseLabel}
          </button>
        </div>
      ) : null}

      {wrapUpOpen ? (
        <SessionImportPanelBody
          sessionId={sessionId}
          recordVisibility={recordVisibility}
          preview={importPreview}
          status={importStatus}
          error={importError}
          onFileSelected={onFileSelected}
          onCommit={onImportCommit}
          onSetGuestReadable={onSetGuestReadable}
        />
      ) : null}

      {showOtherMethods ? (
        <div role="group" aria-labelledby={otherMethodsId}>
          <details onToggle={(event) => setOtherMethodsOpen(event.currentTarget.open)}>
            <summary id={otherMethodsId}>다른 방법</summary>
            <div hidden={!otherMethodsOpen} style={{ marginTop: 10 }}>
              <button
                type="button"
                className="btn btn-quiet btn-sm"
                onClick={() => onOpenAi?.()}
              >
                AI로 생성
              </button>
            </div>
          </details>
        </div>
      ) : null}

      <SessionRecordApplyDialog
        open={Boolean(applyReview?.open)}
        preview={applyReview?.preview ?? null}
        submitting={applyReview?.submitting ?? false}
        onCancel={() => onDismissApply?.()}
        onConfirm={() => onConfirmApply?.()}
      />
    </section>
  );
}
