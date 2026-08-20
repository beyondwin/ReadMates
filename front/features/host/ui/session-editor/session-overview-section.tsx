import type { CSSProperties, JSX, ReactNode } from "react";
import type { HostSessionState } from "../../model/host-session-editor-model";
import type { HostSessionEditorLocation } from "../../model/host-session-editor-navigation";
import type { HostSessionEditorOverview } from "../../model/host-session-editor-view-model";
import { lifecycleConfirmCopy } from "../../model/host-session-lifecycle-model";
import { formatDateTimeLabel } from "@/shared/ui/readmates-display";

const wrapUpTarget: HostSessionEditorLocation = { section: "records", source: "json" };

export function SessionOverviewSection({
  overview,
  sessionState,
  onNextAction,
  onOpenSession,
  onCloseSession,
  onPublishSession,
  onReverseSession,
  reverseLabel,
  lifecyclePending,
}: {
  overview: HostSessionEditorOverview;
  sessionState: HostSessionState | undefined;
  onNextAction: (target: HostSessionEditorLocation) => void;
  onOpenSession?: () => void;
  onCloseSession?: () => void | Promise<void>;
  onPublishSession?: () => void | Promise<void>;
  onReverseSession?: () => void;
  reverseLabel?: string;
  lifecyclePending: boolean;
}): JSX.Element {
  const lifecycle = lifecyclePresentation(sessionState);

  return (
    <section
      id="host-editor-panel-overview"
      role="tabpanel"
      aria-labelledby="host-editor-tab-overview"
      className="surface rm-host-session-editor__overview"
      style={{ padding: 0, overflow: "hidden" }}
    >
      <OverviewRow title="현재 적용본">
        <div className="row-between" style={{ gap: 12, alignItems: "flex-start", flexWrap: "wrap" }}>
          <div>
            <div className="h3 editorial" style={{ margin: 0 }}>
              {overview.applied.exists
                ? overview.applied.versionLabel
                : "아직 적용된 기록이 없습니다"}
            </div>
            <p className="small" style={{ margin: "8px 0 0", color: "var(--text-2)" }}>
              {overview.applied.summary}
            </p>
          </div>
          <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
            <span className="tiny" style={{ color: "var(--text-3)" }}>기록 공개 범위</span>
            <span className="badge">{overview.applied.visibilityLabel}</span>
          </div>
        </div>
        {overview.applied.appliedAt ? (
          <p className="tiny mono" style={{ margin: "10px 0 0", color: "var(--text-3)" }}>
            최근 반영{" "}
            <time dateTime={overview.applied.appliedAt}>
              {formatDateTimeLabel(overview.applied.appliedAt)}
            </time>
          </p>
        ) : null}
      </OverviewRow>

      <OverviewRow title="작업 중인 초안" divided>
        <div className="row-between" style={{ gap: 12, alignItems: "flex-start", flexWrap: "wrap" }}>
          <div>
            <div className="h3 editorial" style={{ margin: 0 }}>
              {overview.draft.exists ? overview.draft.statusLabel : "준비된 초안이 없습니다"}
            </div>
            {overview.draft.sourceLabel ? (
              <p className="small" style={{ margin: "8px 0 0", color: "var(--text-2)" }}>
                작성 방식 · {overview.draft.sourceLabel}
              </p>
            ) : (
              <p className="small" style={{ margin: "8px 0 0", color: "var(--text-2)" }}>
                기록 작업대에서 첫 초안을 시작할 수 있습니다.
              </p>
            )}
          </div>
          {overview.draft.exists ? (
            <span className={draftToneClassName(overview.draft.tone)}>
              {overview.draft.statusLabel}
            </span>
          ) : null}
        </div>
        {overview.draft.updatedAt ? (
          <p className="tiny mono" style={{ margin: "10px 0 0", color: "var(--text-3)" }}>
            최근 저장{" "}
            <time dateTime={overview.draft.updatedAt}>
              {formatDateTimeLabel(overview.draft.updatedAt)}
            </time>
          </p>
        ) : null}
      </OverviewRow>

      <OverviewRow title="다음 할 일" divided>
        <div className="row-between" style={{ gap: 16, alignItems: "flex-start", flexWrap: "wrap" }}>
          <div style={{ minWidth: 0 }}>
            <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
              <span className="badge badge-dot">{lifecycle.label}</span>
            </div>
            <p className="small" style={{ margin: "10px 0 0", color: "var(--text-2)" }}>
              {lifecycle.description}
            </p>
          </div>
          <div className="rm-host-session-editor__lifecycle-actions">
            {sessionState === "DRAFT" && onOpenSession ? (
              <button
                type="button"
                className="btn btn-primary btn-sm"
                disabled={lifecyclePending}
                onClick={onOpenSession}
              >
                {lifecycleConfirmCopy("open").confirmLabel}
              </button>
            ) : null}
            {sessionState === "OPEN" && onCloseSession ? (
              <button
                type="button"
                className="btn btn-primary btn-sm"
                disabled={lifecyclePending}
                onClick={() => void onCloseSession()}
              >
                {lifecycleConfirmCopy("close").confirmLabel}
              </button>
            ) : null}
            {sessionState === "CLOSED" ? (
              <button
                type="button"
                className="btn btn-quiet btn-sm"
                disabled={lifecyclePending}
                onClick={() => onNextAction(wrapUpTarget)}
              >
                정리본 올리기
              </button>
            ) : null}
            {sessionState === "CLOSED" && onPublishSession ? (
              <button
                type="button"
                className="btn btn-primary btn-sm"
                disabled={lifecyclePending}
                onClick={() => void onPublishSession()}
              >
                {lifecycleConfirmCopy("publish").confirmLabel}
              </button>
            ) : null}
            {reverseLabel && onReverseSession ? (
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                disabled={lifecyclePending}
                onClick={onReverseSession}
              >
                {reverseLabel}
              </button>
            ) : null}
          </div>
        </div>

        <div
          className="row-between"
          style={{
            gap: 14,
            alignItems: "center",
            flexWrap: "wrap",
            marginTop: 18,
            paddingTop: 16,
            borderTop: "1px solid var(--line-soft)",
          }}
        >
          <p className="small" style={{ margin: 0, color: "var(--text)" }}>
            {overview.nextAction.label}
          </p>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            disabled={!overview.nextAction.enabled}
            onClick={() => onNextAction(overview.nextAction.target)}
          >
            {overview.nextAction.label}
          </button>
        </div>
      </OverviewRow>
    </section>
  );
}

function OverviewRow({
  title,
  divided = false,
  children,
}: {
  title: string;
  divided?: boolean;
  children: ReactNode;
}) {
  const headingId = `host-editor-overview-${title === "현재 적용본" ? "applied" : title === "작업 중인 초안" ? "draft" : "next"}`;
  const style: CSSProperties = {
    padding: "24px 26px",
    ...(divided ? { borderTop: "1px solid var(--line-soft)" } : {}),
  };

  return (
    <section aria-labelledby={headingId} style={style}>
      <h2 id={headingId} className="eyebrow" style={{ margin: "0 0 14px" }}>
        {title}
      </h2>
      {children}
    </section>
  );
}

function draftToneClassName(tone: HostSessionEditorOverview["draft"]["tone"]) {
  if (tone === "danger") {
    return "badge badge-danger badge-dot";
  }
  if (tone === "warning") {
    return "badge badge-warn badge-dot";
  }
  if (tone === "info") {
    return "badge badge-accent badge-dot";
  }
  return "badge badge-dot";
}

function lifecyclePresentation(state: HostSessionState | undefined) {
  if (!state) {
    return {
      label: "세션 저장 전",
      description: "기본 정보를 저장하면 세션 상태를 관리할 수 있습니다.",
    };
  }
  if (state === "DRAFT") {
    return {
      label: "예정",
      description: "세션을 열기 전입니다. 기본 정보와 기록 초안을 준비할 수 있습니다.",
    };
  }
  if (state === "OPEN") {
    return {
      label: "진행 중",
      description: "모임이 끝났다면 세션을 마감한 뒤 기록을 정리하세요.",
    };
  }
  if (state === "CLOSED") {
    return {
      label: "마감됨",
      description: "모임은 마감되었습니다. 기록 작업대에서 초안을 검토한 뒤 세션을 공개할 수 있습니다.",
    };
  }
  return {
    label: "공개됨",
    description: "공개된 세션입니다. 공개 후에도 기본 정보와 기록 초안을 수정할 수 있습니다.",
  };
}
