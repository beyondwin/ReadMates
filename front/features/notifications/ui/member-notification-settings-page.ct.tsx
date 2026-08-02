import { expect, test } from "@playwright/experimental-ct-react";
import type { NotificationPreferences } from "../model/notification-preferences-model";
import { MemberNotificationSettingsPage } from "./member-notification-settings-page";

const preferences: NotificationPreferences = {
  emailEnabled: true,
  events: {
    NEXT_BOOK_PUBLISHED: true,
    SESSION_REMINDER_DUE: true,
    FEEDBACK_DOCUMENT_PUBLISHED: true,
    REVIEW_PUBLISHED: false,
  },
};

for (const width of [880, 390] as const) {
  test(`notification settings keeps a top-only surface boundary at ${width}px`, async ({ mount, page }) => {
    await page.setViewportSize({ width, height: 800 });
    const component = await mount(
      <MemberNotificationSettingsPage
        state={{ status: "ready", preferences }}
        basePath="/app"
        saving={false}
        saveError={null}
        onEmailEnabledChange={() => undefined}
        onEventEnabledChange={() => undefined}
        onSave={() => undefined}
        onRetryLoad={() => undefined}
      />,
    );
    const surface = component.locator(".rm-member-notification-settings__surface");
    const borders = await surface.evaluate((element) => {
      const style = getComputedStyle(element);
      return { top: style.borderTopWidth, bottom: style.borderBottomWidth };
    });
    const saveButton = component.getByRole("button", { name: "알림 설정 저장" });
    const saveBox = await saveButton.boundingBox();
    const saveRowBox = await component.locator(".rm-member-notification-settings__save").boundingBox();

    expect(borders).toEqual({ top: "1px", bottom: "0px" });
    expect(saveBox!.height).toBeGreaterThanOrEqual(44);
    if (width <= 600) {
      expect(Math.abs(saveBox!.width - saveRowBox!.width)).toBeLessThanOrEqual(1);
    }
  });
}
