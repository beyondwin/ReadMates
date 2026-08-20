import type { MeetingPhase } from "@/features/host/model/host-meeting-ledger-model";

const PHASES = [
  { id: "before", label: "모임 전" },
  { id: "during", label: "진행 중" },
  { id: "after", label: "모임 후" },
] as const satisfies ReadonlyArray<{ id: MeetingPhase; label: string }>;

export function MeetingPhaseRail({ activePhase }: { activePhase: MeetingPhase }) {
  return (
    <nav aria-label="모임 단계">
      <ol className="rm-meeting-phase-rail" role="list">
        {PHASES.map((phase) => {
          const current = phase.id === activePhase;
          return (
            <li
              key={phase.id}
              aria-label={phase.label}
              aria-current={current ? "step" : undefined}
            >
              {phase.label}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
