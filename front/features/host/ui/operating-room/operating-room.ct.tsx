import { expect, test } from "@playwright/experimental-ct-react";
import type { CurrentMeetingHeaderView, MeetingPhaseTabView } from "@/features/host/model/host-operating-room-model";
import {
  expectMinimumTargetSize,
  expectNoHorizontalOverflow,
  expectReducedMotion,
  expectVisibleFocus,
} from "@/tests/e2e/support/visual-authority-contract";
import { CurrentMeetingHeader } from "./current-meeting-header";
import { MeetingPhaseTabs, type MeetingPhaseTabLink } from "./meeting-phase-tabs";

const longMeeting: CurrentMeetingHeaderView = {
  sessionId: "session-27",
  sessionNumber: 27,
  title: "경계가 긴 한글 모임 제목과 A deliberately long English meeting title without clipping",
  bookTitle: "도서 제목이 아주 길어도 표지 대체 영역과 헤더를 밀어내지 않는 책",
  bookAuthor: "긴 이름의 저자와 공동 저자",
  bookImageUrl: null,
  date: "2026-09-01",
  startTime: "19:30",
  endTime: "21:30",
  locationLabel: "을지로 북살롱과 DeliberatelyLongEnglishVenueName",
  lifecycle: "OPEN",
  lifecycleLabel: "준비 중",
  reverseLifecycleAction: null,
};

const links = {
  infoHref: "/clubs/reading-sai/app/host/sessions/session-27?section=basic",
  scheduleHref: "/clubs/reading-sai/app/host/sessions/session-27?section=basic&edit=1",
  historyHref: "/clubs/reading-sai/app/host/sessions/session-27?section=history",
  memberViewHref: "/clubs/reading-sai/app/sessions/session-27",
};

const phases: readonly MeetingPhaseTabLink[] = [
  { id: "prep", label: "준비실", availability: "available", blockedReason: null, href: "?phase=prep" },
  { id: "live", label: "현장", availability: "complete", blockedReason: null, href: "?phase=live" },
  {
    id: "closing",
    label: "마감실",
    availability: "blocked",
    blockedReason: "출석을 확정하고 모임을 마친 뒤 사용할 수 있습니다.",
    href: "?phase=closing",
  },
];

function fixture(
  meeting: CurrentMeetingHeaderView,
  currentPhase: MeetingPhaseTabView["id"] = "prep",
) {
  return (
    <main className="rm-operating-room-ct-shell">
      <CurrentMeetingHeader meeting={meeting} dDayLabel="D-3" links={links} />
      <MeetingPhaseTabs phases={phases} currentPhase={currentPhase} />
      <section id="host-operating-room-phase-panel" aria-label="선택한 운영 단계">
        선택한 단계 내용
      </section>
    </main>
  );
}

for (const viewport of [
  { name: "mobile", width: 390, height: 844 },
  { name: "tablet", width: 768, height: 900 },
  { name: "desktop", width: 1440, height: 960 },
]) {
  test(`meeting context remains operable at ${viewport.width}px`, async ({ mount, page }, testInfo) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    const component = await mount(fixture(longMeeting));

    await expect(component.getByRole("heading", { level: 1 })).toContainText("경계가 긴 한글 모임 제목");
    await expect(component.locator(".rm-book-cover__fallback")).toBeVisible();
    await expect(component.getByText("출석을 확정하고 모임을 마친 뒤 사용할 수 있습니다.")).toBeVisible();
    await expectNoHorizontalOverflow(page);

    for (const link of await component.getByRole("link").all()) {
      await expectMinimumTargetSize(link);
    }

    const currentTab = component.getByRole("tab", { name: /준비실/ });
    await currentTab.focus();
    await expectVisibleFocus(currentTab);

    await page.screenshot({ path: testInfo.outputPath(`operating-room-context-${viewport.name}.png`), fullPage: true });
  });
}

test("partial meeting fields remain explicit at 768px", async ({ mount, page }) => {
  await page.setViewportSize({ width: 768, height: 900 });
  const component = await mount(fixture({
    ...longMeeting,
    date: "",
    startTime: "",
    endTime: "",
    locationLabel: "",
  }));

  await expect(component.getByText("날짜 미정")).toBeVisible();
  await expect(component.getByText("시간 미정")).toBeVisible();
  await expect(component.getByText("장소 미정")).toBeVisible();
  await expectNoHorizontalOverflow(page);
});

test("meeting context stays usable at the 200 percent zoom proxy", async ({ mount, page }, testInfo) => {
  await page.setViewportSize({ width: 320, height: 700 });
  const component = await mount(fixture(longMeeting));

  await expect(component.getByRole("navigation", { name: "현재 모임 작업" })).toBeVisible();
  await expect(component.getByRole("tablist", { name: "모임 운영 단계" })).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await expectReducedMotion(page);
  await page.screenshot({ path: testInfo.outputPath("operating-room-context-200-percent.png"), fullPage: true });
});
