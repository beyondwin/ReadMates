import { expect, test } from "@playwright/experimental-ct-react";
import { buildHostMeetingWorkspace } from "@/features/host/model/host-session-workspace-model";
import { HostMeetingWorkspace } from "./host-meeting-workspace";
import { MeetingRelatedWork } from "./meeting-related-work";
import { MeetingResponseLedger } from "./meeting-response-ledger";

const view = buildHostMeetingWorkspace({
  currentUrl: "https://readmates.test/clubs/alpha/app/host/sessions/session-27",
  state: "OPEN",
  meetingDate: "2026-08-26",
  today: "2026-08-26",
  unansweredResponseCount: 5,
  unknownAttendanceCount: 17,
  recordReadiness: { status: "not-required" },
});

const rows = Array.from({ length: 500 }, (_, index) => ({
  membershipId: `participant-${index}`,
  displayName: index === 0
    ? "아주 긴 한국어 이름과 DeliberatelyLongEnglishNameWithoutPrivateData"
    : `독자 ${index + 1}`,
  secondaryLabel: `참여자 ${index + 1}`,
  response: index % 4 === 0 ? "NO_RESPONSE" as const : "GOING" as const,
  attendance: index % 3 === 0 ? "UNKNOWN" as const : "ATTENDED" as const,
  attendanceRevision: 1,
  questionCount: index % 5,
  recentResponseLabel: index % 4 === 0 ? null : "오늘 20:15",
}));

const props = {
  view,
  header: {
    sessionNumber: 27,
    title: "경계가 긴 한글 모임 제목과 A deliberately long English meeting title without clipping",
    date: "2026.08.26",
    time: "20:00",
    location: "온라인 · 서울의 아주 긴 모임 장소 설명",
  },
  facts: view.facts,
  relatedWork: <MeetingRelatedWork tasks={view.relatedTasks} />,
  panel: (
    <MeetingResponseLedger
      rows={rows.slice(0, 50)}
      onAttendanceChange={() => undefined}
      onBulkAttendanceChange={() => undefined}
    />
  ),
  onPrimaryAction: () => undefined,
};

test("Focus Deck remains usable across the approved viewport matrix", async ({ mount, page }, testInfo) => {
  await page.emulateMedia({ reducedMotion: "reduce", colorScheme: "light" });
  for (const width of [320, 390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    const component = await mount(<HostMeetingWorkspace {...props} />);
    await expect(component.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(component.getByRole("region", { name: "지금 할 일" })).toBeVisible();
    await expect(component.getByRole("region", { name: "진행 목록" })).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, `${width}px must not overflow horizontally`).toBeLessThanOrEqual(1);
    await page.screenshot({ path: testInfo.outputPath(`focus-deck-${width}.png`), fullPage: false });
    await component.unmount();
  }
});

test("Focus Deck keeps its action legible at 200 percent zoom", async ({ mount, page }, testInfo) => {
  await page.setViewportSize({ width: 512, height: 900 });
  const component = await mount(<HostMeetingWorkspace {...props} />);
  await expect(component.getByRole("region", { name: "지금 할 일" })).toBeVisible();
  await expect(component.getByText("실제 출석 확인", { exact: true }).first()).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("focus-deck-200-percent.png"), fullPage: false });
});

test("the response ledger accepts 0, 1, and 500 records without changing its semantics", async ({ mount }) => {
  for (const count of [0, 1, 500]) {
    const component = await mount(
      <MeetingResponseLedger rows={rows.slice(0, count)} onAttendanceChange={() => undefined} onBulkAttendanceChange={() => undefined} />,
    );
    await expect(component.getByRole("heading", { name: "참여자 기록" })).toBeVisible();
    if (count === 0) await expect(component.getByRole("status", { name: "참석 응답 합계" })).toContainText("참석 0");
    await component.unmount();
  }
});

test("bulk attendance confirmation names the member control and preserves selection on cancel", async ({ mount }) => {
  const component = await mount(
    <MeetingResponseLedger rows={rows.slice(0, 1)} onAttendanceChange={() => undefined} onBulkAttendanceChange={() => undefined} />,
  );
  await expect(component.getByLabel(`${rows[0].displayName} 실제 출석`)).toBeVisible();
  await component.getByRole("checkbox", { name: `${rows[0].displayName} 선택` }).check();
  await component.getByRole("button", { name: "출석으로 변경" }).click();
  const dialog = component.getByRole("dialog", { name: "일괄 실제 출석 변경 확인" });
  await expect(dialog).toContainText("선택한 1명을 출석으로 변경합니다");
  await dialog.getByRole("button", { name: "취소" }).click();
  await expect(dialog).toBeHidden();
  await expect(component.getByText("1명 선택")).toBeVisible();
});
