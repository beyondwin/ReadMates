import type { SessionState } from "@/shared/api/readmates";

type SessionIdentityProps = {
  sessionNumber: number;
  state: SessionState;
  date: string;
  published: boolean;
  feedbackDocumentAvailable?: boolean;
  compact?: boolean;
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
  if (state === "DRAFT") return "새 세션 초안";
  if (state === "OPEN") return "이번 세션";
  return "지난 회차";
}

function stateLabel(state: SessionState, published: boolean) {
  if (state === "DRAFT") return "비공개";
  if (state === "OPEN") return "준비 중";
  if (published) return "공개됨";
  return "정리 중";
}

export function SessionIdentity({
  sessionNumber,
  state,
  date,
  published,
  feedbackDocumentAvailable = false,
  compact = false,
}: SessionIdentityProps) {
  const dday = state === "OPEN" ? ddayLabel(date) : null;
  const items = [
    `No.${padSessionNumber(sessionNumber)}`,
    phaseLabel(state),
    stateLabel(state, published),
    dday,
    feedbackDocumentAvailable ? "문서 있음" : null,
  ].filter((item): item is string => Boolean(item));

  return (
    <div
      className={compact ? "rm-session-identity rm-session-identity--compact" : "rm-session-identity"}
      role="group"
      aria-label={items.join(" · ")}
    >
      {items.map((item, index) => (
        <span key={item} className={index === 0 ? "rm-session-identity__number" : "rm-session-identity__chip"}>
          {item}
        </span>
      ))}
    </div>
  );
}
