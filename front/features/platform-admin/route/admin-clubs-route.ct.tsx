import { expect, test } from "@playwright/experimental-ct-react";

test("AdminClubsRoute keeps real triage reasons at supporting-copy size and rhythm", async ({ mount }) => {
  const component = await mount(
    <span className="admin-clubs__triage-reasons">알림 실패 4건 · 도메인 조치 필요</span>,
  );
  const typography = await component.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      fontSize: Number.parseFloat(style.fontSize),
      lineHeight: Number.parseFloat(style.lineHeight),
    };
  });

  expect(typography.fontSize).toBeGreaterThanOrEqual(14);
  expect(typography.lineHeight / typography.fontSize).toBeGreaterThanOrEqual(1.5);
});
