export type HostPrepPaceTier = "STEADY" | "ON_TRACK" | "TIGHT" | "URGENT" | "OVERDUE";

export type HostPrepPaceItemId = "session-basics" | "rsvp" | "checkin";

export type HostPrepPaceInput = {
  hasSession: boolean;
  sessionDate: string | null | undefined; // YYYY-MM-DD (meeting day = deadline)
  hasCoreSessionInfo: boolean;
  rsvpPending: number;
  checkinMissing: number;
  publishPending: number;
  feedbackPending: number;
  today?: Date;
};

export type HostPrepPaceItem = {
  id: HostPrepPaceItemId;
  daysRemaining: number;
  threshold: number;
  slack: number;
};

export type HostPrepPace = {
  tier: HostPrepPaceTier;
  daysRemaining: number | null;
  label: string;
  message: string;
  mostUrgentItem: HostPrepPaceItem | null;
};

const ITEM_THRESHOLDS: Record<HostPrepPaceItemId, number> = {
  "session-basics": 7,
  rsvp: 3,
  checkin: 1,
};

const TIGHT_SLACK = 1;

const PACE_LABELS: Record<HostPrepPaceTier, string> = {
  STEADY: "여유",
  ON_TRACK: "적정",
  TIGHT: "촉박",
  URGENT: "임박",
  OVERDUE: "마감 지남",
};

function nonNeg(value: number): number {
  return Math.max(0, value);
}

function daysUntil(sessionDate: string | null | undefined, today: Date): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(sessionDate ?? "");
  if (!match) {
    return null;
  }
  const [, year, month, day] = match;
  const target = new Date(Number(year), Number(month) - 1, Number(day));
  const current = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.round((target.getTime() - current.getTime()) / 86_400_000);
}

function collectPending(input: HostPrepPaceInput, daysRemaining: number): HostPrepPaceItem[] {
  const items: HostPrepPaceItem[] = [];
  const add = (id: HostPrepPaceItemId) => {
    const threshold = ITEM_THRESHOLDS[id];
    items.push({ id, daysRemaining, threshold, slack: daysRemaining - threshold });
  };
  if (!input.hasCoreSessionInfo) add("session-basics");
  if (nonNeg(input.rsvpPending) > 0) add("rsvp");
  if (nonNeg(input.checkinMissing) > 0) add("checkin");
  return items;
}

function itemDetail(id: HostPrepPaceItemId, input: HostPrepPaceInput): string {
  switch (id) {
    case "session-basics":
      return "책 정보·일정·미팅 URL";
    case "rsvp":
      return `RSVP 미응답 ${nonNeg(input.rsvpPending)}명`;
    case "checkin":
      return `읽기 진행률 미작성 ${nonNeg(input.checkinMissing)}명`;
  }
}

function result(
  tier: HostPrepPaceTier,
  daysRemaining: number | null,
  message: string,
  mostUrgentItem: HostPrepPaceItem | null,
): HostPrepPace {
  return { tier, daysRemaining, label: PACE_LABELS[tier], message, mostUrgentItem };
}

export function deriveHostPrepPace(input: HostPrepPaceInput): HostPrepPace {
  const today = input.today ?? new Date();

  if (!input.hasSession) {
    return result("STEADY", null, "열린 세션이 없어요. 새 세션을 만들면 준비 페이스가 표시됩니다.", null);
  }

  const daysRemaining = daysUntil(input.sessionDate, today);
  const hasCloseout = nonNeg(input.publishPending) > 0 || nonNeg(input.feedbackPending) > 0;

  if (daysRemaining === null) {
    const pending = collectPending(input, 0);
    if (pending.length === 0) {
      return result("STEADY", null, "지금 준비할 항목이 없어요.", null);
    }
    return result("ON_TRACK", null, "세션 날짜를 확정하면 준비 페이스를 정확히 볼 수 있어요.", null);
  }

  if (daysRemaining < 0) {
    if (hasCloseout) {
      return result(
        "OVERDUE",
        daysRemaining,
        "모임일이 지났는데 마감 정리가 남았어요. 공개 요약·피드백 문서를 마무리하세요.",
        null,
      );
    }
    return result("STEADY", daysRemaining, "모임일이 지났고 마감 정리도 끝났어요.", null);
  }

  const pending = collectPending(input, daysRemaining);
  if (pending.length === 0) {
    return result("STEADY", daysRemaining, "모임 전 준비가 안정적이에요.", null);
  }

  const mostUrgent = pending.reduce((a, b) => (b.slack < a.slack ? b : a));
  const detail = itemDetail(mostUrgent.id, input);

  if (mostUrgent.slack < 0) {
    return result(
      "URGENT",
      daysRemaining,
      `${detail} — 이미 준비 마감창(D-${mostUrgent.threshold})을 넘겼어요. 지금 처리하세요.`,
      mostUrgent,
    );
  }
  if (mostUrgent.slack <= TIGHT_SLACK) {
    return result(
      "TIGHT",
      daysRemaining,
      `${detail} — 마감창(D-${mostUrgent.threshold})이 가까워요. 곧 처리하세요.`,
      mostUrgent,
    );
  }
  return result("ON_TRACK", daysRemaining, `${detail}이 남았지만 아직 여유 있어요.`, mostUrgent);
}
