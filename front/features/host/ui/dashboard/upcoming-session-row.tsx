import type { CSSProperties } from "react";
import type { HostSessionListItem, SessionRecordVisibility } from "@/features/host/ui/host-ui-types";
import { hostSessionEditHref } from "@/features/host/model/host-dashboard-model";
import { formatDateOnlyLabel } from "@/shared/ui/readmates-display";
import { SessionTimingIdentity } from "@/shared/ui/session-identity";
import type { HostDashboardLinkComponent, UpcomingActionHandlers } from "./types";

const UPCOMING_START_BLOCKED_MESSAGE = "현재 열린 세션이 있어 예정 세션을 바로 시작할 수 없습니다.";
const UPCOMING_MOBILE_ACTION_STYLE: CSSProperties = {
  flex: "0 0 auto",
  minWidth: 64,
  paddingLeft: 10,
  paddingRight: 10,
  whiteSpace: "nowrap",
  wordBreak: "keep-all",
};

export function UpcomingSessionRow({
  session,
  actions,
  showSeparator = true,
  LinkComponent,
}: {
  session: HostSessionListItem;
  actions: UpcomingActionHandlers;
  showSeparator?: boolean;
  LinkComponent: HostDashboardLinkComponent;
}) {
  const isMemberVisible = session.visibility !== "HOST_ONLY";
  const visibilityPending = actions.isPending(session.sessionId, "visibility");
  const openPending = actions.isPending(session.sessionId, "open");
  const controlsDisabled = actions.isBusy;
  const currentVisibilityLabel = upcomingVisibilityStatusLabel(session.visibility);
  const visibilityActionLabel = visibilityPending ? "처리 중" : isMemberVisible ? "비공개" : "공개";
  const visibilityActionAriaLabel = visibilityPending
    ? `처리 중 · ${session.bookTitle}`
    : `${session.bookTitle} 공개 범위를 ${isMemberVisible ? "비공개" : "멤버 공개"}로 변경`;
  const showOpenAction = actions.canOpenSession || openPending;
  const openLabel = openPending ? "처리 중" : "현재로 시작";

  return (
    <div
      className="row-between"
      style={{ gap: 12, padding: "14px 16px", borderTop: showSeparator ? "1px solid var(--line-soft)" : undefined }}
    >
      <div style={{ minWidth: 0 }}>
        <SessionTimingIdentity sessionNumber={session.sessionNumber} date={session.date} tone="muted" />
        <div className="body editorial" style={{ marginTop: 6, fontSize: 16 }}>
          {session.bookTitle}
        </div>
        <div className="tiny" style={{ marginTop: 4 }}>
          {session.bookAuthor} · {formatDateOnlyLabel(session.date)} · {session.locationLabel}
        </div>
        <div className="tiny" style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 8 }}>
          <span style={{ color: "var(--text-3)" }}>공개 범위</span>
          <span aria-hidden="true" style={{ color: "var(--text-3)" }}>
            ·
          </span>
          <strong style={{ color: "var(--accent)", fontWeight: 700 }}>{currentVisibilityLabel}</strong>
        </div>
      </div>
      <div className="row" style={{ gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
        {showOpenAction ? (
          <button
            className="btn btn-ghost btn-sm"
            type="button"
            disabled={controlsDisabled}
            aria-label={`${openLabel} · ${session.bookTitle}`}
            onClick={() => actions.openSession(session.sessionId)}
          >
            {openLabel}
          </button>
        ) : null}
        <button
          className="btn btn-ghost btn-sm"
          type="button"
          disabled={controlsDisabled}
          aria-label={visibilityActionAriaLabel}
          onClick={() => actions.updateVisibility(session.sessionId, isMemberVisible ? "HOST_ONLY" : "MEMBER")}
        >
          {visibilityActionLabel}
        </button>
        <LinkComponent className="btn btn-ghost btn-sm" to={hostSessionEditHref(session.sessionId)} aria-label={`편집 · ${session.bookTitle}`}>
          편집
        </LinkComponent>
      </div>
    </div>
  );
}

export function UpcomingSessionMobileCard({
  session,
  actions,
  LinkComponent,
}: {
  session: HostSessionListItem;
  actions: UpcomingActionHandlers;
  LinkComponent: HostDashboardLinkComponent;
}) {
  const isMemberVisible = session.visibility !== "HOST_ONLY";
  const visibilityPending = actions.isPending(session.sessionId, "visibility");
  const openPending = actions.isPending(session.sessionId, "open");
  const controlsDisabled = actions.isBusy;
  const currentVisibilityLabel = upcomingVisibilityStatusLabel(session.visibility);
  const visibilityActionLabel = visibilityPending ? "처리 중" : isMemberVisible ? "비공개" : "공개";
  const visibilityActionAriaLabel = visibilityPending
    ? `처리 중 · ${session.bookTitle}`
    : `${session.bookTitle} 공개 범위를 ${isMemberVisible ? "비공개" : "멤버 공개"}로 변경`;
  const showOpenAction = actions.canOpenSession || openPending;
  const openLabel = openPending ? "처리 중" : "현재로 시작";

  return (
    <div className="m-card-quiet">
      <SessionTimingIdentity sessionNumber={session.sessionNumber} date={session.date} tone="muted" />
      <div className="body editorial" style={{ marginTop: 6 }}>
        {session.bookTitle}
      </div>
      <div className="tiny" style={{ marginTop: 4 }}>
        {formatDateOnlyLabel(session.date)}
      </div>
      <div className="tiny" style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 8 }}>
        <span style={{ color: "var(--text-3)" }}>공개 범위</span>
        <span aria-hidden="true" style={{ color: "var(--text-3)" }}>
          ·
        </span>
        <strong style={{ color: "var(--accent)", fontWeight: 700 }}>{currentVisibilityLabel}</strong>
      </div>
      <div className="row" style={{ gap: 8, marginTop: 12, flexWrap: "wrap" }}>
        {showOpenAction ? (
          <button
            className="btn btn-primary btn-sm"
            type="button"
            style={UPCOMING_MOBILE_ACTION_STYLE}
            aria-label={`${openLabel} · ${session.bookTitle}`}
            disabled={controlsDisabled}
            onClick={() => actions.openSession(session.sessionId)}
          >
            {openLabel}
          </button>
        ) : null}
        <button
          className="btn btn-ghost btn-sm"
          type="button"
          style={UPCOMING_MOBILE_ACTION_STYLE}
          disabled={controlsDisabled}
          aria-label={visibilityActionAriaLabel}
          onClick={() => actions.updateVisibility(session.sessionId, isMemberVisible ? "HOST_ONLY" : "MEMBER")}
        >
          {visibilityActionLabel}
        </button>
        <LinkComponent
          className="btn btn-ghost btn-sm"
          to={hostSessionEditHref(session.sessionId)}
          style={UPCOMING_MOBILE_ACTION_STYLE}
          aria-label={`편집 · ${session.bookTitle}`}
        >
          편집
        </LinkComponent>
      </div>
    </div>
  );
}

function upcomingVisibilityStatusLabel(visibility: SessionRecordVisibility) {
  if (visibility === "HOST_ONLY") {
    return "비공개";
  }

  if (visibility === "PUBLIC") {
    return "전체 공개";
  }

  return "멤버 공개";
}

export function UpcomingStartBlockedNotice({ mobile = false }: { mobile?: boolean }) {
  return (
    <div
      className={mobile ? "tiny" : "surface-quiet tiny"}
      style={{
        color: "var(--text-2)",
        margin: mobile ? "6px 0 10px" : "0 0 10px",
        padding: mobile ? undefined : "10px 12px",
      }}
    >
      {UPCOMING_START_BLOCKED_MESSAGE}
    </div>
  );
}

export function UpcomingActionMessage({
  message,
  mobile = false,
}: {
  message: { kind: "alert" | "status"; text: string };
  mobile?: boolean;
}) {
  return (
    <div
      className="tiny"
      role={message.kind}
      style={{
        marginTop: mobile ? 10 : 12,
        color: message.kind === "alert" ? "var(--danger)" : "var(--text-3)",
      }}
    >
      {message.text}
    </div>
  );
}
