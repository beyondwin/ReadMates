import { expect, test } from "@playwright/experimental-ct-react";
import {
  expectMinimumTargetSize,
  expectNoHorizontalOverflow,
} from "@/tests/e2e/support/visual-authority-contract";
import { HostMeetingWorkspace } from "./host-meeting-workspace";
import { openFocusDeck } from "./host-focus-deck.fixtures";
import { MeetingRelatedWork } from "./meeting-related-work";

for (const viewport of [
  { width: 390, height: 844 },
  { width: 767, height: 900 },
  { width: 768, height: 900 },
  { width: 1024, height: 900 },
  { width: 1199, height: 900 },
  { width: 1200, height: 900 },
  { width: 1440, height: 960 },
]) {
  test(`lifecycle destination exposes one primary action at ${viewport.width}px`, async ({ mount, page }) => {
    await page.setViewportSize(viewport);
    await page.evaluate(() => document.documentElement.style.setProperty("--m-nav-h", "56px"));
    const component = await mount(
      <HostMeetingWorkspace
        view={openFocusDeck.view}
        diary={openFocusDeck.diary}
        header={openFocusDeck.header}
        facts={openFocusDeck.view.facts}
        relatedWork={<MeetingRelatedWork tasks={openFocusDeck.view.relatedTasks} />}
        projections={openFocusDeck.projections}
        recordReadiness={openFocusDeck.recordReadiness}
        publicRecordHref={openFocusDeck.publicRecordHref}
        memberViewHref={openFocusDeck.memberViewHref}
        onPrimaryAction={() => undefined}
      />,
    );

    const namedActions = component.getByRole("button", { name: "실제 출석 확인" });
    const visibleCount = await namedActions.evaluateAll((elements) => elements.filter((element) => {
      const style = getComputedStyle(element);
      const box = element.getBoundingClientRect();
      return style.display !== "none" && style.visibility !== "hidden" && box.width > 0 && box.height > 0;
    }).length);
    expect(visibleCount).toBe(1);

    const visibleAction = component.locator('.rm-host-session-workspace__cta--desktop:visible, .rm-host-session-workspace__cta--mobile:visible');
    await expect(visibleAction).toHaveCount(1);
    await expectMinimumTargetSize(visibleAction);
    await expectNoHorizontalOverflow(page);

    if (viewport.width < 900) {
      const actionBox = await visibleAction.boundingBox();
      expect(actionBox).not.toBeNull();
      expect(actionBox!.y + actionBox!.height).toBeLessThanOrEqual(viewport.height - 56 + 1);
    }
  });
}
