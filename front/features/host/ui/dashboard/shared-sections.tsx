import { useState, type CSSProperties, type ReactNode } from "react";
import type { HostDashboardResponse } from "@/features/host/model/host-view-types";
import {
  getHostDashboardPublicationFeedbackRows,
  type HostChecklistState as ChecklistState,
  type HostDashboardNextOperationAction as NextOperationAction,
  type MissingCurrentSessionMembersSummary as MissingCurrentSessionMembers,
} from "@/features/host/model/host-dashboard-model";
import type { ReadmatesReturnState, ReadmatesReturnTarget } from "@/shared/routing/readmates-route-state";
import type { HostPrepPace } from "@/features/host/model/host-prep-pace";
import { HOST_DASHBOARD_LABELS } from "./constants";
import { badgeClass } from "./dashboard-helpers";
import { HostPrepPaceNote } from "./host-prep-pace-note";
import type {
  HostDashboardActions,
  HostDashboardLinkComponent,
  HostDashboardMissingMemberAction,
  MissingCurrentSessionMember,
  QuickActionIcon,
} from "./types";

export function MissingCurrentSessionMembersAlert({
  alert,
  mobile = false,
  actions,
  onResolved,
  LinkComponent,
}: {
  alert: MissingCurrentSessionMembers;
  mobile?: boolean;
  actions: HostDashboardActions;
  onResolved: (membershipId: string) => void;
  LinkComponent: HostDashboardLinkComponent;
}) {
  const [pendingActions, setPendingActions] = useState<Set<string>>(() => new Set());
  const [message, setMessage] = useState<null | { kind: "alert" | "status"; text: string }>(null);
  const memberNames = alert.members.length > 0 ? alert.members.map((member) => member.displayName).join(", ") : null;
  const countLabel = `새 멤버 ${alert.count}명이 현재 세션에 아직 없습니다.`;
  const className = mobile ? "m-card" : "rm-ledger-row";
  const style = mobile
    ? ({ marginBottom: 12 } as CSSProperties)
    : ({
        padding: "20px 22px",
        marginBottom: "18px",
        color: "var(--text)",
        background: "var(--warning-soft)",
        borderColor: "var(--warning-line)",
      } as CSSProperties);
  const submitAction = async (member: MissingCurrentSessionMember, action: HostDashboardMissingMemberAction) => {
    const key = `${member.membershipId}:${action}`;
    if (pendingActions.has(key)) {
      return;
    }

    setPendingActions((current) => new Set(current).add(key));
    setMessage(null);

    try {
      await actions.updateCurrentSessionParticipation(member.membershipId, action);
      onResolved(member.membershipId);
      setMessage({
        kind: "status",
        text: action === "add" ? "이번 세션에 추가했습니다." : "다음 세션부터 참여하도록 표시했습니다.",
      });
    } catch {
      setMessage({ kind: "alert", text: "멤버 세션 상태 업데이트에 실패했습니다. 목록을 확인한 뒤 다시 시도해 주세요." });
    } finally {
      setPendingActions((current) => {
        const next = new Set(current);
        next.delete(key);
        return next;
      });
    }
  };

  return (
    <article className={className} style={style} role="status">
      <div className="stack" style={{ "--stack": "14px" } as CSSProperties}>
        <div>
          <span className="badge badge-warn badge-dot">확인 필요</span>
          <h2 className={mobile ? "h4 editorial" : "h3 editorial"} style={{ margin: "8px 0 0" }}>
            {countLabel}
          </h2>
          {memberNames ? (
            <p className="small" style={{ color: "var(--text-2)", margin: "4px 0 0" }}>
              {memberNames}
            </p>
          ) : null}
          <p className="tiny" style={{ margin: "8px 0 0", color: "var(--text-3)" }}>
            승인된 멤버 목록과 현재 세션 참석 명단을 비교한 결과입니다. 처리하면 이 알림에서 사라집니다.
          </p>
        </div>
        {message ? (
          <p
            role={message.kind}
            className="small"
            style={{ margin: 0, color: message.kind === "alert" ? "var(--danger)" : "var(--text-2)" }}
          >
            {message.text}
          </p>
        ) : null}
        {alert.members.length > 0 ? (
          <div className="stack" style={{ "--stack": "10px" } as CSSProperties}>
            {alert.members.map((member) => {
              const rowPending = pendingActions.has(`${member.membershipId}:add`) || pendingActions.has(`${member.membershipId}:remove`);

              return (
                <div
                  key={member.membershipId}
                  className="row-between"
                  style={{
                    gap: 12,
                    flexWrap: "wrap",
                    alignItems: "center",
                    borderTop: "1px solid var(--line-soft)",
                    paddingTop: 10,
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div className="body" style={{ fontSize: mobile ? "13.5px" : "14px", fontWeight: 600 }}>
                      {member.displayName}
                    </div>
                    <div className="tiny">{member.email}</div>
                  </div>
                  <div className="row" style={{ gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
                    <button
                      type="button"
                      className="btn btn-primary btn-sm"
                      disabled={rowPending}
                      onClick={() => void submitAction(member, "add")}
                    >
                      이번 세션에 추가
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      disabled={rowPending}
                      onClick={() => void submitAction(member, "remove")}
                    >
                      다음 세션부터
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <LinkComponent to="/app/host/members" className="btn btn-primary btn-sm" style={{ alignSelf: "flex-start" }}>
            멤버 관리
          </LinkComponent>
        )}
      </div>
    </article>
  );
}


export function NextActionCard({
  action,
  pace,
  mobile = false,
  LinkComponent,
  hostDashboardReturnTarget,
  readmatesReturnState,
}: {
  action: NextOperationAction;
  pace: HostPrepPace;
  mobile?: boolean;
  LinkComponent: HostDashboardLinkComponent;
  hostDashboardReturnTarget: ReadmatesReturnTarget;
  readmatesReturnState: (target: ReadmatesReturnTarget) => ReadmatesReturnState;
}) {
  const body = (
    <>
      <div className="eyebrow" style={{ marginBottom: 8 }}>
        {HOST_DASHBOARD_LABELS.nextAction}
      </div>
      <div style={{ marginBottom: 10 }}>
        <span className="badge badge-accent badge-dot">{action.loopLabel}</span>
      </div>
      <h2 className={mobile ? "h4 editorial" : "h3 editorial"} style={{ margin: 0 }}>
        {action.title}
      </h2>
      <p className="small" style={{ margin: "8px 0 0", color: "var(--text-2)" }}>
        {action.helper}
      </p>
      <p className="tiny" style={{ margin: "8px 0 0", color: "var(--text-3)" }}>
        {action.loopBridge}
      </p>
      <HostPrepPaceNote pace={pace} />
      {action.label ? (
        <div style={{ marginTop: 14 }}>
          {action.href ? (
            <LinkComponent to={action.href} state={readmatesReturnState(hostDashboardReturnTarget)} className="btn btn-primary btn-sm">
              {action.label}
            </LinkComponent>
          ) : (
            <button
              className="btn btn-ghost btn-sm"
              type="button"
              disabled
              aria-label={`${action.label}: ${action.unavailableReason ?? action.helper}`}
            >
              {action.label}
            </button>
          )}
        </div>
      ) : null}
      {!action.href && action.unavailableReason ? (
        <p className="tiny" style={{ margin: "8px 0 0", color: "var(--text-3)" }}>
          {action.unavailableReason}
        </p>
      ) : null}
    </>
  );

  return (
    <section className={mobile ? "m-card" : "rm-document-panel"} style={{ padding: mobile ? undefined : "20px 22px" }}>
      {body}
    </section>
  );
}


export function PublicationFeedbackSection({ data, mobile = false }: { data: HostDashboardResponse; mobile?: boolean }) {
  const rows = getHostDashboardPublicationFeedbackRows(data);

  return (
    <section className={mobile ? "m-list" : "rm-reading-desk"} style={{ padding: mobile ? undefined : "8px 18px" }}>
      {!mobile ? (
        <div className="eyebrow" style={{ paddingTop: 12, marginBottom: 4 }}>
          {HOST_DASHBOARD_LABELS.publishFeedback}
        </div>
      ) : null}
      {rows.map((row) => (
        <div
          key={row.label}
          className={mobile ? "m-list-row rm-host-dashboard-mobile__two-column-row rm-host-dashboard-mobile__publication-row" : "row-between"}
          style={{
            gap: 14,
            padding: mobile ? undefined : "12px 0",
            borderTop: mobile || row.label === "공개 기록" ? undefined : "1px solid var(--line-soft)",
          }}
        >
          <div style={{ minWidth: 0 }}>
            <div className="body" style={{ fontSize: "13.5px", fontWeight: 600 }}>
              {row.label}
            </div>
            <div className="tiny" style={{ marginTop: 2 }}>
              {row.helper}
            </div>
          </div>
          <span className={badgeClass(row.tone === "ok" ? 0 : 1, row.tone)}>{row.value}</span>
        </div>
      ))}
    </section>
  );
}


export function ChecklistMarker({
  state,
  label,
  mobile = false,
}: {
  state: ChecklistState;
  label: string;
  mobile?: boolean;
}) {
  const desktopStyle = mobile
    ? undefined
    : {
        width: "20px",
        height: "20px",
        borderRadius: "999px",
        background: state === "complete" ? "var(--ok)" : "transparent",
        border: `1px solid ${state === "complete" ? "var(--ok)" : "var(--line-strong)"}`,
        color: state === "complete" ? "var(--paper-50)" : "var(--text-3)",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: "12px",
      };
  const mobileStyle = mobile && state !== "complete" ? { color: "var(--text-3)" } : undefined;

  return (
    <span
      aria-label={label}
      className={mobile ? "rm-host-dashboard-mobile__check" : undefined}
      data-done={state === "complete" ? "true" : "false"}
      data-state={state}
      style={desktopStyle ?? mobileStyle}
    >
      {state === "complete" ? <Icon name="check" size={10} /> : state === "guidance" ? "i" : ""}
    </span>
  );
}


export function SectionHeader({
  eyebrow,
  title,
  action,
}: {
  eyebrow: string;
  title: string;
  action?: ReactNode;
}) {
  return (
    <div className="row-between" style={{ alignItems: "flex-end", marginBottom: "16px" }}>
      <div>
        <div className="eyebrow" style={{ marginBottom: "8px" }}>
          {eyebrow}
        </div>
        <h2 className="h2" style={{ margin: 0 }}>
          {title}
        </h2>
      </div>
      {action}
    </div>
  );
}


export function Icon({
  name,
  size = 16,
  style,
}: {
  name: QuickActionIcon | "arrow-right";
  size?: number;
  style?: CSSProperties;
}) {
  const common = {
    width: size,
    height: size,
    viewBox: "0 0 20 20",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
    style,
  };

  switch (name) {
    case "arrow-right":
      return (
        <svg {...common}>
          <path d="M4 10h12M11 5l5 5-5 5" />
        </svg>
      );
    case "check":
      return (
        <svg {...common}>
          <path d="M4 10.5l4 4L16 6" />
        </svg>
      );
    case "edit":
      return (
        <svg {...common}>
          <path d="M4 16h3l8-8-3-3-8 8v3zM12 5l3 3" />
        </svg>
      );
    case "notes":
      return (
        <svg {...common}>
          <path d="M5 3h7l3 3v11a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" />
          <path d="M12 3v3h3M7 10h6M7 13h4" />
        </svg>
      );
  }
}
