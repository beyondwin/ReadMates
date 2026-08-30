import { useRef, type KeyboardEvent } from "react";
import type {
  HostMeetingPhase,
  MeetingPhaseTabView,
} from "@/features/host/model/host-operating-room-model";
import "./operating-room.css";

export type MeetingPhaseTabLink = MeetingPhaseTabView & {
  href: string;
};

export type MeetingPhaseTabsProps = {
  phases: readonly MeetingPhaseTabLink[];
  currentPhase: HostMeetingPhase;
  panelId?: string;
  onPhaseChange?: (phase: HostMeetingPhase) => void;
};

function phaseStateLabel(
  phase: MeetingPhaseTabLink,
  current: boolean,
): string | null {
  if (current && phase.availability === "complete") return "현재 · 완료";
  if (current) return "현재";
  if (phase.availability === "complete") return "완료";
  if (phase.availability === "blocked") return "잠김";
  return null;
}

export function MeetingPhaseTabs({
  phases,
  currentPhase,
  panelId = "host-operating-room-phase-panel",
  onPhaseChange,
}: MeetingPhaseTabsProps) {
  const phaseRefs = useRef(new Map<HostMeetingPhase, HTMLAnchorElement>());
  const availablePhases = phases.filter((phase) => phase.availability !== "blocked");
  const tabStopPhase = availablePhases.some((phase) => phase.id === currentPhase)
    ? currentPhase
    : availablePhases[0]?.id;

  const moveFocus = (event: KeyboardEvent<HTMLAnchorElement>, phase: HostMeetingPhase) => {
    const currentIndex = availablePhases.findIndex((candidate) => candidate.id === phase);
    if (currentIndex < 0) return;

    let nextIndex: number | null = null;
    if (event.key === "ArrowRight") nextIndex = (currentIndex + 1) % availablePhases.length;
    if (event.key === "ArrowLeft") nextIndex = (currentIndex - 1 + availablePhases.length) % availablePhases.length;
    if (event.key === "Home") nextIndex = 0;
    if (event.key === "End") nextIndex = availablePhases.length - 1;
    if (nextIndex === null) return;

    event.preventDefault();
    const nextPhase = availablePhases[nextIndex];
    if (nextPhase) phaseRefs.current.get(nextPhase.id)?.focus();
  };

  return (
    <nav className="rm-operating-room-phases" aria-label="모임 운영 단계">
      <div className="rm-operating-room-phases__list" role="tablist" aria-label="모임 운영 단계">
        {phases.map((phase) => {
          const current = phase.id === currentPhase;
          const blocked = phase.availability === "blocked";
          const reasonId = `operating-room-phase-${phase.id}-reason`;
          const stateLabel = phaseStateLabel(phase, current);
          const content = (
            <>
              <span className="rm-operating-room-phases__label">{phase.label}</span>
              {stateLabel ? (
                <span className="rm-operating-room-phases__state">{stateLabel}</span>
              ) : null}
            </>
          );

          return (
            <div className="rm-operating-room-phases__item" key={phase.id}>
              {blocked ? (
                <span
                  className="rm-operating-room-phases__tab is-blocked"
                  role="tab"
                  aria-selected="false"
                  aria-disabled="true"
                  aria-controls={panelId}
                  aria-describedby={reasonId}
                >
                  {content}
                </span>
              ) : (
                <a
                  ref={(node) => {
                    if (node) phaseRefs.current.set(phase.id, node);
                    else phaseRefs.current.delete(phase.id);
                  }}
                  className="rm-operating-room-phases__tab"
                  role="tab"
                  href={phase.href}
                  tabIndex={phase.id === tabStopPhase ? 0 : -1}
                  aria-selected={current}
                  aria-current={current ? "page" : undefined}
                  aria-controls={panelId}
                  onClick={() => onPhaseChange?.(phase.id)}
                  onKeyDown={(event) => moveFocus(event, phase.id)}
                >
                  {content}
                </a>
              )}
              {blocked && phase.blockedReason ? (
                <p id={reasonId} className="rm-operating-room-phases__reason">
                  {phase.blockedReason}
                </p>
              ) : null}
            </div>
          );
        })}
      </div>
    </nav>
  );
}
