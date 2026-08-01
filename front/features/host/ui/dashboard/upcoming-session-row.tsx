import type { HostSessionListItem, SessionRecordVisibility } from "@/features/host/model/host-view-types";
import {
  getHostUpcomingSessionTiming,
  hostSessionEditHref,
} from "@/features/host/model/host-dashboard-model";
import { formatDateOnlyLabel } from "@/shared/ui/readmates-display";
import { SessionTimingIdentity } from "@/shared/ui/session-identity";
import type { HostDashboardLinkComponent, UpcomingActionHandlers } from "./types";

const UPCOMING_START_BLOCKED_MESSAGE = "현재 열린 세션이 있어 예정 세션을 바로 시작할 수 없습니다.";
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
  const visibilityActionLabel = visibilityPending ? "저장 중" : isMemberVisible ? "비공개" : "공개";
  const visibilityActionAriaLabel = visibilityPending
    ? `공개 범위를 저장하는 중 · ${session.bookTitle}`
    : `${session.bookTitle} 공개 범위를 ${isMemberVisible ? "비공개" : "멤버 공개"}로 변경`;
  const showOpenAction = actions.canOpenSession || openPending;
  const openLabel = openPending ? "세션을 시작하는 중" : "현재로 시작";

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
  now,
}: {
  session: HostSessionListItem;
  actions: UpcomingActionHandlers;
  LinkComponent: HostDashboardLinkComponent;
  now?: Date;
}) {
  const timing = getHostUpcomingSessionTiming(session.date, now);
  const isMemberVisible = session.visibility !== "HOST_ONLY";
  const visibilityPending = actions.isPending(session.sessionId, "visibility");
  const openPending = actions.isPending(session.sessionId, "open");
  const controlsDisabled = actions.isBusy;
  const currentVisibilityLabel = upcomingVisibilityStatusLabel(session.visibility);
  const showOpenAction = actions.canOpenSession || openPending;
  const editIsPrimary = timing.state === "overdue" || timing.state === "unknown" || !showOpenAction;
  const openLabel = openPending ? "세션을 시작하는 중" : "현재로 시작";
  const visibilityActionLabel = visibilityPending
    ? "공개 범위 저장 중"
    : isMemberVisible
      ? "비공개로 변경"
      : "멤버 공개로 변경";

  return (
    <div className="m-card-quiet">
      <SessionTimingIdentity sessionNumber={session.sessionNumber} date={session.date} tone="muted" />
      <h3 className="body editorial" style={{ margin: "6px 0 0" }}>
        {session.bookTitle}
      </h3>
      <div className="tiny rm-host-upcoming-mobile__date-row">
        <span>{formatDateOnlyLabel(session.date)}</span>
        <span className={`badge rm-host-upcoming-mobile__timing rm-host-upcoming-mobile__timing--${timing.state}`}>
          {timing.statusLabel}
        </span>
      </div>
      <div className="tiny" style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 8 }}>
        <span style={{ color: "var(--text-3)" }}>공개 범위</span>
        <span aria-hidden="true" style={{ color: "var(--text-3)" }}>
          ·
        </span>
        <strong style={{ color: "var(--accent)", fontWeight: 700 }}>{currentVisibilityLabel}</strong>
      </div>
      <div className="rm-host-upcoming-mobile__actions">
        {editIsPrimary ? (
          <LinkComponent
            className="btn btn-primary btn-sm"
            to={hostSessionEditHref(session.sessionId)}
            aria-label={`${timing.editLabel} · ${session.bookTitle}`}
          >
            {timing.editLabel}
          </LinkComponent>
        ) : (
          <button
            className="btn btn-primary btn-sm"
            type="button"
            aria-label={`${openLabel} · ${session.bookTitle}`}
            disabled={controlsDisabled}
            onClick={() => actions.openSession(session.sessionId)}
          >
            {openLabel}
          </button>
        )}
        {!editIsPrimary ? (
          <LinkComponent
            className="btn btn-ghost btn-sm"
            to={hostSessionEditHref(session.sessionId)}
            aria-label={`${timing.editLabel} · ${session.bookTitle}`}
          >
            {timing.editLabel}
          </LinkComponent>
        ) : showOpenAction ? (
          <button
            className="btn btn-ghost btn-sm"
            type="button"
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
          disabled={controlsDisabled}
          aria-label={`${visibilityActionLabel} · ${session.bookTitle}`}
          onClick={() => actions.updateVisibility(session.sessionId, isMemberVisible ? "HOST_ONLY" : "MEMBER")}
        >
          {visibilityActionLabel}
        </button>
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
