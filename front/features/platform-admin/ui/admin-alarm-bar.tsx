import { Link } from "react-router";
import { ADMIN_COPY } from "@/features/platform-admin/model/admin-copy";
import type { AdminAlarmSummary } from "@/features/platform-admin/model/admin-alarm-summary";

export type { AdminAlarmSummary };

const SEOUL_TIME = new Intl.DateTimeFormat("ko-KR", {
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZone: "Asia/Seoul",
});

export function AdminAlarmBar({
  summary,
  state,
}: {
  summary: AdminAlarmSummary | null;
  state: "ready" | "loading" | "unavailable";
}) {
  const unavailable = state === "unavailable";
  const attentionCount = summary?.attention.count ?? 0;
  const showLive = state === "ready" && attentionCount > 0;
  const announce = unavailable || showLive;
  const secondary = secondaryText(state, summary);
  const asOfLabel = state === "ready" ? formatAsOf(summary?.asOf ?? null) : null;

  return (
    <div
      className="admin-alarm-bar"
      role={announce ? "status" : undefined}
      aria-busy={state === "loading" || undefined}
    >
      {showLive && summary?.serviceState === "ok" ? (
        <span className="admin-alarm-bar__banner">
          서비스는 정상이며, 확인할 일이 {attentionCount}건 있습니다.
        </span>
      ) : null}
      {showLive ? (
        <span className="admin-alarm-bar__live">
          {`${ADMIN_COPY.alarm.attention} ${attentionCount}건`}
          {summary?.attention.headline ? ` — ${summary.attention.headline}` : null}
        </span>
      ) : null}
      {secondary ? (
        <span className="admin-alarm-bar__secondary">{secondary}</span>
      ) : null}
      {unavailable ? (
        <span className="admin-alarm-bar__separator" aria-hidden="true">
          {" · "}
        </span>
      ) : null}
      <Link to="/admin/today" className="admin-alarm-bar__today">
        {ADMIN_COPY.alarm.openToday}
      </Link>
      {asOfLabel ? (
        <span className="admin-alarm-bar__asof">{asOfLabel}</span>
      ) : null}
    </div>
  );
}

function secondaryText(
  state: "ready" | "loading" | "unavailable",
  summary: AdminAlarmSummary | null,
): string | null {
  if (state === "unavailable") return ADMIN_COPY.alarm.unavailable;
  if (state !== "ready" || summary == null) return null;
  const parts: string[] = [
    summary.unacknowledged === 0
      ? ADMIN_COPY.alarm.noUnacknowledged
      : `${ADMIN_COPY.alarm.unacknowledged} ${summary.unacknowledged}건`,
  ];
  if (summary.serviceState === "ok") parts.push(ADMIN_COPY.alarm.serviceOk);
  if (summary.serviceState === "degraded") parts.push(ADMIN_COPY.alarm.serviceDegraded);
  return parts.join(" · ");
}

function formatAsOf(iso: string | null): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return `${SEOUL_TIME.format(date)} ${ADMIN_COPY.alarm.asOfSuffix}`;
}
