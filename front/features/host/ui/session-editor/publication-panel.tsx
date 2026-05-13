import { memo, type CSSProperties } from "react";
import type { HostSessionDetailResponse } from "@/features/host/model/host-view-types";
import {
  recordVisibilityDescription,
  recordVisibilityLabel,
  type SessionRecordVisibility,
} from "@/features/host/model/host-session-editor-model";
import { Panel } from "./session-editor-panel";
import type { MobileEditorSection } from "./mobile-editor-tabs";

type PublicationFeedback = {
  tone: "success" | "error";
  message: string;
};

export const PublicationPanel = memo(function PublicationPanel({
  activeMobileSection,
  session,
  sessionState,
  recordVisibility,
  recordSaveInFlight,
  lifecycleSaveState,
  summary,
  publicationFeedback,
  publicationLifecycleHelp,
  onRecordVisibilityChange,
  onSummaryChange,
  onPublicationFeedbackChange,
  onSavePublication,
  onCloseSession,
  onPublishRecord,
}: {
  activeMobileSection: MobileEditorSection;
  session?: HostSessionDetailResponse | null;
  sessionState?: HostSessionDetailResponse["state"];
  recordVisibility: SessionRecordVisibility;
  recordSaveInFlight: boolean;
  lifecycleSaveState: "idle" | "saving" | "saved" | "error";
  summary: string;
  publicationFeedback: PublicationFeedback | null;
  publicationLifecycleHelp: string;
  onRecordVisibilityChange: (visibility: SessionRecordVisibility) => void;
  onSummaryChange: (summary: string) => void;
  onPublicationFeedbackChange: (feedback: PublicationFeedback | null) => void;
  onSavePublication: () => Promise<void>;
  onCloseSession: () => Promise<void>;
  onPublishRecord: () => Promise<void>;
}) {
  return (
    <Panel
      eyebrow="기록 · 공개 범위"
      title="기록 공개 범위"
      tone="warn"
      mobileSection="publish"
      panelId="host-editor-panel-publish"
      activeMobileSection={activeMobileSection}
    >
      <div className="stack" style={{ "--stack": "14px" } as CSSProperties}>
        <fieldset className="stack" style={{ "--stack": "10px", border: 0, padding: 0, margin: 0 } as CSSProperties}>
          <legend className="label">공개 범위</legend>
          {(["HOST_ONLY", "MEMBER", "PUBLIC"] as const).map((visibility) => {
            const selected = recordVisibility === visibility;

            return (
              <label
                key={visibility}
                className="row"
                style={{
                  alignItems: "flex-start",
                  gap: "10px",
                  padding: "10px 14px",
                  borderRadius: "8px",
                  border: `1px solid ${selected ? "var(--accent)" : "var(--line)"}`,
                  background: selected ? "var(--accent-soft)" : "var(--bg)",
                  cursor: !session || recordSaveInFlight ? "not-allowed" : "pointer",
                  opacity: !session || recordSaveInFlight ? 0.72 : 1,
                }}
              >
                <input
                  type="radio"
                  name="record-visibility"
                  value={visibility}
                  checked={selected}
                  disabled={!session || recordSaveInFlight}
                  onChange={() => {
                    onRecordVisibilityChange(visibility);
                    if (publicationFeedback?.tone === "error") {
                      onPublicationFeedbackChange(null);
                    }
                  }}
                  style={{ marginTop: "3px" }}
                />
                <span>
                  <span className="body">{recordVisibilityLabel(visibility)}</span>
                  <span className="tiny" style={{ display: "block", color: "var(--text-3)" }}>
                    {recordVisibilityDescription(visibility)}
                  </span>
                </span>
              </label>
            );
          })}
        </fieldset>
      </div>
      <hr className="divider-soft" style={{ margin: "20px 0" }} />
      <div>
        <label className="label" htmlFor="public-summary">
          기록 요약
        </label>
        <textarea
          id="public-summary"
          className="textarea"
          rows={3}
          value={summary}
          disabled={recordSaveInFlight}
          onChange={(event) => {
            onSummaryChange(event.target.value);
            if (publicationFeedback?.tone === "error") {
              onPublicationFeedbackChange(null);
            }
          }}
          placeholder="모임의 분위기와 대화의 결을 2~3문장으로 짧게."
          aria-describedby="publication-summary-help publication-lifecycle-help publication-feedback"
        />
        <div id="publication-summary-help" className="tiny" style={{ marginTop: "6px", color: "var(--text-3)" }}>
          선택한 공개 범위에 맞춰 기록 화면에 반영됩니다.
        </div>
        <div id="publication-lifecycle-help" className="tiny" style={{ marginTop: "6px", color: "var(--text-3)" }}>
          {publicationLifecycleHelp}
        </div>
      </div>
      <div className="row" style={{ gap: "8px", flexWrap: "wrap", justifyContent: "flex-end", marginTop: "16px" }}>
        <button
          type="button"
          className="btn btn-primary"
          disabled={!session || recordSaveInFlight}
          aria-describedby={!session ? "publication-lifecycle-help" : undefined}
          onClick={() => void onSavePublication()}
        >
          {recordSaveInFlight ? "저장하는 중" : "저장"}
        </button>
        {session && sessionState === "OPEN" ? (
          <button
            type="button"
            className="btn btn-secondary"
            disabled={lifecycleSaveState === "saving"}
            onClick={() => void onCloseSession()}
          >
            {lifecycleSaveState === "saving" ? "마감하는 중" : "세션 마감"}
          </button>
        ) : null}
        {session && sessionState === "CLOSED" ? (
          <button
            type="button"
            className="btn btn-primary"
            disabled={recordSaveInFlight || lifecycleSaveState === "saving"}
            onClick={() => void onPublishRecord()}
          >
            {lifecycleSaveState === "saving" ? "공개하는 중" : "기록 공개"}
          </button>
        ) : null}
        {session && sessionState === "PUBLISHED" ? (
          <span className="badge badge-ok">공개 완료</span>
        ) : null}
      </div>
      {publicationFeedback ? (
        <div
          id="publication-feedback"
          role={publicationFeedback.tone === "error" ? "alert" : "status"}
          className={publicationFeedback.tone === "error" ? "marginalia" : "small"}
          style={{
            marginTop: "12px",
            color: publicationFeedback.tone === "error" ? "var(--danger)" : "var(--accent)",
          }}
        >
          {publicationFeedback.message}
        </div>
      ) : (
        <div id="publication-feedback" />
      )}
    </Panel>
  );
});
