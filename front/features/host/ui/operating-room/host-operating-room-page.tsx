import type { ReactNode } from "react";
import type {
  HostMeetingPhase,
  HostOperatingRoomView,
} from "@/features/host/model/host-operating-room-model";
import type { HostLinkComponent } from "@/features/host/ui/host-link-types";
import { CurrentMeetingHeader, type CurrentMeetingHeaderLinks } from "./current-meeting-header";
import { HostNextAction } from "./host-next-action";
import { MeetingPhaseTabs, type MeetingPhaseTabLink } from "./meeting-phase-tabs";
import { PreparationLedger } from "./preparation-ledger";
import "./operating-room.css";

export type AttendanceRecoveryView =
  | {
      kind: "conflict";
      intendedLabel: string;
      canonicalLabel: string;
      onRetry: () => void;
    }
  | {
      kind: "unknown";
      canonicalLabel: string | null;
      onReconcile: () => void;
      historyHref: string;
    };

export type HostOperatingRoomPageProps = {
  view: HostOperatingRoomView;
  dDayLabel: string | null;
  headerLinks: CurrentMeetingHeaderLinks | null;
  phaseLinks: readonly MeetingPhaseTabLink[];
  phaseNormalizationReason: string | null;
  optionalFailureMessages: readonly string[];
  recovery: AttendanceRecoveryView | null;
  liveContent: ReactNode;
  closingContent: ReactNode;
  workboxContent: ReactNode;
  createMeetingHref: string;
  onPhaseChange: (phase: HostMeetingPhase) => void;
  onRetryPreparation: () => void;
  onRetryOptional: () => void;
  nextActionPending: boolean;
  onDeferNextAction: (workItemKey: string) => void;
  LinkComponent: HostLinkComponent;
};

export function HostOperatingRoomPage({
  view,
  dDayLabel,
  headerLinks,
  phaseLinks,
  phaseNormalizationReason,
  optionalFailureMessages,
  recovery,
  liveContent,
  closingContent,
  workboxContent,
  createMeetingHref,
  onPhaseChange,
  onRetryPreparation,
  onRetryOptional,
  nextActionPending,
  onDeferNextAction,
  LinkComponent,
}: HostOperatingRoomPageProps) {
  if (!view.meeting || !headerLinks) {
    return (
      <main className="rm-host-operating-room rm-host-operating-room--empty">
        <div className="rm-host-operating-room__body rm-host-operating-room__body--empty">
          <section className="rm-host-operating-room__empty" aria-labelledby="host-operating-room-empty-title">
            <h1 className="h1 editorial">모임 운영실</h1>
            <h2 id="host-operating-room-empty-title" className="h2 editorial">현재 운영할 모임이 없습니다</h2>
            <p>첫 모임을 만들면 준비부터 현장, 마감까지 한 흐름에서 이어갈 수 있습니다.</p>
            <LinkComponent to={createMeetingHref} className="rm-operating-room-next-action__primary">
              첫 모임 만들기
            </LinkComponent>
          </section>
          <aside className="rm-host-operating-room__workbox-rail" aria-label="클럽 작업함">
            {workboxContent}
          </aside>
        </div>
      </main>
    );
  }

  return (
    <main className="rm-host-operating-room">
      <CurrentMeetingHeader
        meeting={view.meeting}
        dDayLabel={dDayLabel}
        links={headerLinks}
        LinkComponent={LinkComponent}
      />
      <MeetingPhaseTabs
        phases={phaseLinks}
        currentPhase={view.phase}
        onPhaseChange={onPhaseChange}
      />

      {phaseNormalizationReason ? (
        <p
          className="rm-host-operating-room__phase-notice"
          role="status"
          aria-label="운영 단계 이동 안내"
        >
          {phaseNormalizationReason}
        </p>
      ) : null}

      <div className="rm-host-operating-room__body">
        <div className="rm-host-operating-room__primary">
          <HostNextAction
            action={view.nextAction}
            pending={nextActionPending}
            onDefer={onDeferNextAction}
            LinkComponent={LinkComponent}
          />

          {recovery?.kind === "conflict" ? (
          <section
            className="rm-host-operating-room__recovery"
            role="alert"
            aria-label="출석 변경 충돌"
          >
            <h2>최신 출석과 내 선택을 비교해 주세요</h2>
            <dl>
              <div><dt>내가 선택한 값</dt><dd>{recovery.intendedLabel}</dd></div>
              <div><dt>최신 값</dt><dd>{recovery.canonicalLabel}</dd></div>
            </dl>
            <button type="button" onClick={recovery.onRetry}>내 선택으로 다시 저장</button>
          </section>
        ) : null}

          {recovery?.kind === "unknown" ? (
          <section
            className="rm-host-operating-room__recovery"
            role="status"
            aria-label="출석 변경 결과 확인"
          >
            <h2>출석 변경 결과를 확인하고 있습니다</h2>
            <p>같은 변경을 다시 보내지 않습니다. 최신 출석과 변경 내역에서 결과를 확인하세요.</p>
            {recovery.canonicalLabel ? <p>현재 확인된 값: {recovery.canonicalLabel}</p> : null}
            <div className="rm-host-operating-room__recovery-actions">
              <button type="button" onClick={recovery.onReconcile}>최신 출석 확인</button>
              <LinkComponent to={recovery.historyHref}>변경 내역 열기</LinkComponent>
            </div>
          </section>
        ) : null}

          {optionalFailureMessages.length > 0 ? (
          <section
            className="rm-host-operating-room__partial"
            role="region"
            aria-label="일부 운영 정보 불러오기 실패"
          >
            <h2>일부 운영 정보는 따로 다시 불러올 수 있습니다</h2>
            <ul>
              {optionalFailureMessages.map((message) => <li key={message}>{message}</li>)}
            </ul>
            <button type="button" onClick={onRetryOptional}>일부 운영 정보 다시 불러오기</button>
          </section>
        ) : null}

          <section
            id="host-operating-room-phase-panel"
            className="rm-host-operating-room__phase-panel"
            role="tabpanel"
            aria-label={`${phaseLabel(view.phase)} 운영`}
          >
            {view.phase === "prep" ? (
              <PreparationLedger
                rows={view.preparation}
                onRetry={onRetryPreparation}
                LinkComponent={LinkComponent}
              />
            ) : null}
            {view.phase === "live" ? liveContent : null}
            {view.phase === "closing" ? closingContent : null}
          </section>
        </div>
        <aside className="rm-host-operating-room__workbox-rail" aria-label="클럽 작업함">
          {workboxContent}
        </aside>
      </div>
    </main>
  );
}

function phaseLabel(phase: HostMeetingPhase): string {
  if (phase === "live") return "현장";
  if (phase === "closing") return "마감실";
  return "준비실";
}
