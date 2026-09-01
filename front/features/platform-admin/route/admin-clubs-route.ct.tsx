import { expect, test } from "@playwright/experimental-ct-react";
import "../ui/admin-club-management.css";

test("AdminClubsRoute keeps actionable recent signals at supporting-copy size and rhythm", async ({ mount }) => {
  const component = await mount(
    <dl className="admin-club-management__facts">
      <div className="admin-club-management__signal">
        <dt>최근 신호</dt>
        <dd>알림 실패 4건 · 도메인 조치 필요</dd>
      </div>
    </dl>,
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
