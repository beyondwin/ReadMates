import type { SessionState } from "@/shared/model/readmates-types";

type SessionIdentityProps = {
  sessionNumber: number;
  state: SessionState;
  date: string;
  published: boolean;
  feedbackDocumentAvailable?: boolean;
  compact?: boolean;
  hidePastPhaseLabel?: boolean;
  hideFeedbackDocumentLabel?: boolean;
};

type SessionTimingIdentityProps = {
  sessionNumber: number;
  date: string;
  phaseLabel?: string;
  compact?: boolean;
  tone?: "pending" | "muted";
};

function padSessionNumber(value: number) {
  return String(value).padStart(2, "0");
}

function ddayLabel(date: string, now = new Date()) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) return null;

  const [, year, month, day] = match;
  const target = new Date(Number(year), Number(month) - 1, Number(day));
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diffDays = Math.round((target.getTime() - today.getTime()) / 86_400_000);

  if (diffDays === 0) return "D-day";
  return diffDays > 0 ? `D-${diffDays}` : `D+${Math.abs(diffDays)}`;
}

function phaseLabel(state: SessionState) {
  if (state === "DRAFT") return "예정 세션";
  if (state === "OPEN") return "이번 세션";
  return "지난 회차";
}

function stateLabel(state: SessionState, published: boolean) {
  if (state === "DRAFT") return "예정";
  if (state === "OPEN") return "준비 중";
  if (published) return "공개됨";
  return "정리 중";
}

function stateToneClass(value: string) {
  if (value === "예정") return "rm-state rm-state--pending";
  if (value === "준비 중") return "rm-state rm-state--pending";
  if (value === "공개됨" || value === "문서 있음") return "rm-state rm-state--success";
  if (value === "정리 중") return "rm-state rm-state--readonly";
  return "";
}

export function SessionIdentity({
  sessionNumber,
  state,
  date,
  published,
  feedbackDocumentAvailable = false,
  compact = false,
  hidePastPhaseLabel = false,
  hideFeedbackDocumentLabel = false,
}: SessionIdentityProps) {
  const dday = state === "OPEN" ? ddayLabel(date) : null;
  const phase = phaseLabel(state);
  const items = [
    { value: `No.${padSessionNumber(sessionNumber)}`, className: "rm-session-identity__number" },
    hidePastPhaseLabel && phase === "지난 회차" ? null : { value: phase, className: "rm-session-identity__chip" },
    { value: stateLabel(state, published), className: `rm-session-identity__chip ${stateToneClass(stateLabel(state, published))}` },
    dday ? { value: dday, className: "rm-session-identity__chip rm-state rm-state--pending" } : null,
    feedbackDocumentAvailable && !hideFeedbackDocumentLabel
      ? { value: "문서 있음", className: `rm-session-identity__chip ${stateToneClass("문서 있음")}` }
      : null,
  ].filter((item): item is { value: string; className: string } => Boolean(item));

  return (
    <div
      className={compact ? "rm-session-identity rm-session-identity--compact" : "rm-session-identity"}
      data-session-state={state}
      data-published={published ? "true" : "false"}
      data-feedback-document={feedbackDocumentAvailable ? "available" : "unavailable"}
      role="group"
      aria-label={items.map((item) => item.value).join(" · ")}
    >
      {items.map((item) => (
        <span key={item.value} className={item.className}>
          {item.value}
        </span>
      ))}
    </div>
  );
}

export function SessionTimingIdentity({
  sessionNumber,
  date,
  phaseLabel: phase,
  compact = true,
  tone = "pending",
}: SessionTimingIdentityProps) {
  const number = `No.${padSessionNumber(sessionNumber)}`;
  const dday = ddayLabel(date);
  const toneClass = tone === "muted" ? "" : "rm-state rm-state--pending";
  const numberClass =
    tone === "muted"
      ? "rm-session-identity__chip"
      : `rm-session-identity__number rm-session-identity__chip ${toneClass}`;
  const items = [
    { value: number, className: numberClass },
    dday ? { value: dday, className: `rm-session-identity__chip ${toneClass}` } : null,
    phase ? { value: phase, className: "rm-session-identity__chip" } : null,
  ].filter((item): item is { value: string; className: string } => Boolean(item));
  const className = [
    "rm-session-identity",
    compact ? "rm-session-identity--compact" : null,
    tone === "muted" ? "rm-session-identity--muted" : null,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      className={className}
      role="group"
      aria-label={items.map((item) => item.value).join(" · ")}
    >
      {items.map((item) => (
        <span key={item.value} className={item.className}>
          {item.value}
        </span>
      ))}
    </div>
  );
}
