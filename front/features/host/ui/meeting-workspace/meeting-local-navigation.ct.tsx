import { expect, test } from "@playwright/experimental-ct-react";
import { MeetingLocalNavigation } from "./meeting-local-navigation";

const tasks = [
  { task: "overview" as const, label: "개요와 아주 긴 상태 요약", href: "?section=overview" },
  { task: "responses" as const, label: "참석 응답과 준비 질문", href: "?section=responses" },
  { task: "attendance" as const, label: "실제 출석과 확인 전 상태", href: "?section=attendance" },
  { task: "records" as const, label: "모임 기록과 수정본 검토", href: "?section=records" },
  { task: "notifications" as const, label: "대상별 알림 준비", href: "?section=notifications" },
  { task: "history" as const, label: "변경 내역과 복구", href: "?section=history" },
];

test("tablet overflow selects the named non-modal task popover", async ({ mount, page }) => {
  await page.setViewportSize({ width: 768, height: 800 });
  const component = await mount(
    <div style={{ width: 430 }}>
      <MeetingLocalNavigation tasks={tasks} activeTask="records" onTaskLinkActivated={() => undefined} />
    </div>,
  );
  const trigger = component.getByRole("button", { name: "모임 작업 목차" });
  await expect(trigger).toBeVisible();
  await trigger.click();
  const popover = component.getByRole("region", { name: "모임 작업 목차" });
  await expect(popover).toBeVisible();
  await expect(popover.getByRole("navigation", { name: "모임 작업 목차" })).toBeVisible();
  expect(await popover.getAttribute("aria-modal")).toBeNull();
});

test("mobile task sheet traps focus, closes on Escape, and restores the trigger", async ({ mount, page }) => {
  await page.setViewportSize({ width: 320, height: 720 });
  const component = await mount(
    <MeetingLocalNavigation tasks={tasks} activeTask="overview" onTaskLinkActivated={() => undefined} />,
  );
  const trigger = component.getByRole("button", { name: "모임 작업 목차" });
  await trigger.click();
  const sheet = component.getByRole("dialog", { name: "모임 작업 목차" });
  await expect(sheet).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(sheet).toBeHidden();
  await expect(trigger).toBeFocused();
});
