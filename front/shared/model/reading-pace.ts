export type ReadingPaceTier = "COMPLETED" | "ON_TRACK" | "TIGHT" | "URGENT" | "AMPLE";

export type ReadingPaceInput = {
  readingProgress: number; // 0..100
  sessionDate: string | null | undefined; // YYYY-MM-DD (deadline = meeting day)
  today?: Date;
};

export type ReadingPace = {
  tier: ReadingPaceTier;
  daysRemaining: number | null;
  label: string;
  message: string;
};

const NEAR_DEADLINE_DAYS = 3;
const AMPLE_DAYS = 5;
const URGENT_PROGRESS = 50;
const TIGHT_PROGRESS = 80;

const PACE_LABELS: Record<ReadingPaceTier, string> = {
  COMPLETED: "완독",
  ON_TRACK: "순조",
  TIGHT: "촉박",
  URGENT: "서둘러요",
  AMPLE: "여유",
};

const PACE_MESSAGES: Record<ReadingPaceTier, string> = {
  COMPLETED: "이번 책을 다 읽었어요. 모임을 기다리면 됩니다.",
  ON_TRACK: "지금 페이스면 모임 전까지 무리 없어요.",
  TIGHT: "모임이 가까워요. 남은 분량을 조금씩 당겨 읽어요.",
  URGENT: "모임이 곧이라 속도를 올려야 해요.",
  AMPLE: "아직 시간이 넉넉해요. 편하게 읽어 나가세요.",
};

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

function tierFor(progress: number, daysRemaining: number | null): ReadingPaceTier {
  if (progress >= 100) {
    return "COMPLETED";
  }
  if (daysRemaining === null) {
    return "ON_TRACK";
  }
  if (daysRemaining <= NEAR_DEADLINE_DAYS) {
    if (progress < URGENT_PROGRESS) return "URGENT";
    if (progress < TIGHT_PROGRESS) return "TIGHT";
    return "ON_TRACK";
  }
  if (daysRemaining > AMPLE_DAYS) {
    return "AMPLE";
  }
  return "ON_TRACK";
}

export function deriveReadingPace(input: ReadingPaceInput): ReadingPace {
  const today = input.today ?? new Date();
  const daysRemaining = daysUntil(input.sessionDate, today);
  const tier = tierFor(input.readingProgress, daysRemaining);
  return { tier, daysRemaining, label: PACE_LABELS[tier], message: PACE_MESSAGES[tier] };
}
