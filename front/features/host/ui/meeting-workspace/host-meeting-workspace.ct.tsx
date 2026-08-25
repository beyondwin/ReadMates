import { expect, test } from "@playwright/experimental-ct-react";
import { HostMeetingWorkspace, type HostMeetingWorkspaceProps } from "./host-meeting-workspace";
import { MeetingResponseLedger } from "./meeting-response-ledger";

const tasks: HostMeetingWorkspaceProps["tasks"] = [
  { task: "overview", label: "개요", href: "?section=overview" },
  { task: "responses", label: "참석 응답과 준비 질문", href: "?section=responses", badge: "미응답 5" },
  { task: "attendance", label: "실제 출석", href: "?section=attendance", badge: "확인 필요" },
  { task: "records", label: "모임 기록과 수정본 검토", href: "?section=records", badge: "초안 있음" },
  { task: "notifications", label: "알림", href: "?section=notifications" },
  { task: "history", label: "변경 내역", href: "?section=history" },
];

const rows = Array.from({ length: 500 }, (_, index) => ({
  membershipId: `participant-${index}`,
  displayName: index === 0
    ? "아주 긴 한국어 이름과 DeliberatelyLongEnglishNameWithoutPrivateData"
    : `독자 ${index + 1}`,
  secondaryLabel: `참여자 ${index + 1}`,
  response: index % 4 === 0 ? "NO_RESPONSE" as const : "GOING" as const,
  attendance: index % 3 === 0 ? "UNKNOWN" as const : "ATTENDED" as const,
  questionCount: index % 5,
  recentResponseLabel: index % 4 === 0 ? null : "오늘 20:15",
}));

const props: HostMeetingWorkspaceProps = {
  identity: {
    title: "경계가 긴 한글 모임 제목과 A deliberately long English meeting title without clipping",
    bookTitle: "우리가 서로의 세계를 읽는 아주 긴 책 제목",
    number: 27,
    lifecycle: "OPEN",
    statusLabel: "멤버와 준비 중",
    dateLabel: "2026.08.26 · 20:00",
    locationLabel: "온라인 · 서울의 아주 긴 모임 장소 설명",
  },
  tasks,
  activeTask: "responses",
  primaryAction: { kind: "CHECK_ATTENDANCE", label: "실제 출석 확인", disabled: false },
  panel: {
    kind: "ready",
    task: "responses",
    content: <MeetingResponseLedger rows={rows.slice(0, 50)} onAttendanceChange={() => undefined} onBulkAttendanceChange={() => undefined} />,
  },
  judgment: {
    title: "지금 확인할 일",
    summary: "참석 응답과 실제 출석은 서로 다른 사실입니다. 모임을 마치기 전에 확인 전 상태를 검토합니다.",
    checks: ["실제 출석 확인 전 17명", "알림은 자동으로 보내지 않음"],
    projections: [
      { audience: "호스트", result: "참여자 응답과 실제 출석을 계속 편집" },
      { audience: "게스트·멤버", result: "준비 화면에서 허용된 정보만 확인" },
      { audience: "공개 기록", result: "공개 기록에 게시 안 됨" },
    ],
  },
  announcements: [],
  LinkComponent: ({ to, children, ...linkProps }) => <a href={to} {...linkProps}>{children}</a>,
  onTaskLinkActivated: () => undefined,
  onPrimaryAction: () => undefined,
  onRetryPanel: () => undefined,
};

test("Meeting Folio remains usable across the approved viewport matrix", async ({ mount, page }, testInfo) => {
  await page.emulateMedia({ reducedMotion: "reduce", colorScheme: "light" });
  for (const width of [320, 390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    const component = await mount(<HostMeetingWorkspace {...props} />);
    await expect(component.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(component.getByRole("main", { name: "현재 모임 작업" })).toBeVisible();
    await expect(component.getByRole("complementary", { name: "지금 확인할 일" })).toBeVisible();
    if (width >= 1120) {
      const contextNav = component.getByRole("navigation", { name: "현재 모임 작업" });
      await expect(contextNav).toBeVisible();
      expect((await contextNav.boundingBox())?.width ?? 0).toBeGreaterThan(120);
    }
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, `${width}px must not overflow horizontally`).toBeLessThanOrEqual(1);
    await page.screenshot({ path: testInfo.outputPath(`meeting-folio-${width}.png`), fullPage: false });
    await component.unmount();
  }
});

test("Meeting Folio keeps its task and action legible at 200 percent zoom", async ({ mount, page }, testInfo) => {
  // 1024px at 200% browser zoom exposes roughly a 512 CSS-pixel content viewport.
  await page.setViewportSize({ width: 512, height: 900 });
  const component = await mount(<HostMeetingWorkspace {...props} />);
  await expect(component.getByRole("button", { name: "모임 작업 목차" })).toBeVisible();
  await expect(component.getByText("실제 출석 확인", { exact: true }).first()).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("meeting-folio-200-percent.png"), fullPage: false });
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
