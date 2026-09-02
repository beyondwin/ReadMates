import { useState } from "react";
import type { HostOperatingRoomView } from "@/features/host/model/host-operating-room-model";
import { HostOperatingRoomPage } from "./host-operating-room-page";

const phaseLinks = [
  { id: "prep", label: "준비실", availability: "available", blockedReason: null, href: "?phase=prep" },
  { id: "live", label: "현장", availability: "complete", blockedReason: null, href: "?phase=live" },
  { id: "closing", label: "마감실", availability: "complete", blockedReason: null, href: "?phase=closing" },
] as const;

const view: HostOperatingRoomView = {
  meeting: {
    sessionId: "public-safe-session-27",
    sessionNumber: 27,
    title: "경계가 긴 한글 모임 제목과 A deliberately long English meeting title without clipping",
    bookTitle: "이미지가 없어도 운영 문맥을 잃지 않는 아주 긴 책 제목",
    bookAuthor: "Long Public-safe Author Name",
    bookImageUrl: null,
    date: "2026-09-01",
    startTime: "19:30",
    endTime: "21:30",
    locationLabel: "온라인과 오프라인을 함께 설명하는 DeliberatelyLongEnglishVenueName",
    lifecycle: "OPEN",
    lifecycleLabel: "준비 중",
    reverseLifecycleAction: null,
  },
  phases: phaseLinks,
  phase: "prep",
  nextAction: {
    kind: "schedule-seen",
    state: "actionable",
    workItemKey: "public-safe-work-item-27",
    label: "최신 일정을 확인하지 않은 참여자 검토",
    reason: "긴 한국어와 English recovery copy가 함께 있어도 다음 행동이 잘리지 않습니다.",
    href: "/clubs/public-safe/app/host/sessions/public-safe-session-27/schedule-review",
  },
  preparation: [],
  partialFailures: [],
  closing: null,
};

export function OperatingRoomPhaseContinuityStory() {
  const [phase, setPhase] = useState<HostOperatingRoomView["phase"]>("prep");
  return (
    <HostOperatingRoomPage
      view={{ ...view, phase }}
      dDayLabel="D-1"
      headerLinks={{
        infoHref: "/clubs/public-safe/app/host/sessions/public-safe-session-27?section=basic",
        scheduleHref: "/clubs/public-safe/app/host/sessions/public-safe-session-27?section=basic&edit=1",
        historyHref: "/clubs/public-safe/app/host/sessions/public-safe-session-27?section=history",
        memberViewHref: "/clubs/public-safe/app/sessions/public-safe-session-27",
      }}
      phaseLinks={phaseLinks}
      phaseNormalizationReason={null}
      optionalFailureMessages={[]}
      recovery={null}
      liveContent={<section aria-label="현장 운영">현장 운영</section>}
      closingContent={<section aria-label="마감 운영">마감 운영</section>}
      workboxContent={<aside aria-label="클럽 작업함">클럽 작업함</aside>}
      createMeetingHref="/clubs/public-safe/app/host/sessions/new"
      onPhaseChange={setPhase}
      onRetryPreparation={() => undefined}
      onRetryOptional={() => undefined}
      nextActionPending={false}
      onDeferNextAction={() => undefined}
    />
  );
}
