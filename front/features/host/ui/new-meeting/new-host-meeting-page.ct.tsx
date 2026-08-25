import { expect, test } from "@playwright/experimental-ct-react";
import { emptyNewMeetingDraft } from "../../model/new-host-meeting-model";
import { NewHostMeetingPage } from "./new-host-meeting-page";

test("new meeting remains the same calm folio family at 320 and 768", async ({ mount, page }, testInfo) => {
  for (const width of [320, 768]) {
    await page.setViewportSize({ width, height: 860 });
    const component = await mount(
      <NewHostMeetingPage
        draft={{ ...emptyNewMeetingDraft(), title: "아주 긴 새 모임 제목과 Long English title", bookTitle: "읽을 책" }}
        errors={{}}
        suggestionStatus="ready"
        suggestionMessage="최근 모임의 시작 시간을 제안합니다."
        suggestionReason="최근 3개 모임"
        sourceMeetingCount={3}
        sensitiveSuggestionAvailable={false}
        status="editing"
        formError={null}
        savedMeeting={null}
        prepareConfirmationOpen={false}
        prepareError={null}
        onFieldChange={() => undefined}
        onSubmit={() => undefined}
        onCheckPendingCreate={() => undefined}
        onRetrySuggestions={() => undefined}
        onAdoptSensitiveSuggestion={() => undefined}
        onPrepareRequested={() => undefined}
        onPrepareCanceled={() => undefined}
        onPrepareConfirmed={() => undefined}
      />,
    );
    await expect(component.getByRole("heading", { level: 1, name: "새 모임 만들기" })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`new-meeting-${width}.png`), fullPage: true });
    await component.unmount();
  }
});
