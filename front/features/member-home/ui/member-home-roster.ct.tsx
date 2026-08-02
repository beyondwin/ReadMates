import { expect, test } from "@playwright/experimental-ct-react";
import type { CurrentSessionReadPageData } from "@/shared/model/current-session-read-view";
import { MEMBER_READ_SURFACE_CAPABILITIES } from "@/shared/model/read-surface-capabilities";
import { RosterSummary } from "./member-home-records";

const attendees = Array.from({ length: 9 }, (_, index) => ({
  renderKey: `membership-${index + 1}`,
  avatarKey: index % 2 === 0 ? "cloud-green-book" : "banana-green-book",
  displayName: `참석자 ${index + 1}`,
  role: "MEMBER" as const,
  rsvpStatus: index < 6 ? "GOING" as const : "NO_RESPONSE" as const,
  attendanceStatus: "UNKNOWN" as const,
  participationStatus: "ACTIVE" as const,
}));

const current: CurrentSessionReadPageData = {
  currentSession: {
    sessionId: "session-9",
    sessionNumber: 9,
    title: "9회차 모임",
    bookTitle: "공개 테스트 도서",
    bookAuthor: "저자",
    bookLink: null,
    bookImageUrl: null,
    date: "2026-08-09",
    startTime: "19:00",
    endTime: "21:00",
    locationLabel: "모임 공간",
    meetingUrl: null,
    meetingPasscode: null,
    questionDeadlineAt: "2026-08-08T12:00:00Z",
    myRsvpStatus: "GOING",
    myCheckin: null,
    myQuestions: [],
    myOneLineReview: null,
    myLongReview: null,
    board: { questions: [], longReviews: [] },
    attendees,
    capabilities: MEMBER_READ_SURFACE_CAPABILITIES,
  },
};

for (const [width, expectedColumns] of [[1200, 8], [390, 5], [320, 4]] as const) {
  test(`RSVP roster uses ${expectedColumns} columns at ${width}px`, async ({ mount, page }) => {
    await page.setViewportSize({ width, height: 700 });
    const component = await mount(<RosterSummary current={current} />);
    const roster = component.locator(".rm-member-home-roster");
    const tracks = await roster.evaluate((element) =>
      getComputedStyle(element).gridTemplateColumns.trim().split(/\s+/),
    );

    expect(tracks).toHaveLength(expectedColumns);
    await expect(component.locator(".rm-member-home-roster__item")).toHaveCount(9);
    expect(await component.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
  });
}

test("RSVP roster keeps eight avatars distinct inside the production sidebar width", async ({ mount, page }) => {
  await page.setViewportSize({ width: 1200, height: 700 });
  const component = await mount(
    <div style={{ width: 308 }}>
      <RosterSummary current={current} />
    </div>,
  );
  const roster = component.locator(".rm-member-home-roster");
  const avatars = roster.locator(".rm-avatar-chip");
  const boxes = await avatars.evaluateAll((elements) =>
    elements.map((element) => {
      const box = element.getBoundingClientRect();
      return { left: box.left, right: box.right, top: box.top };
    }),
  );

  expect(boxes).toHaveLength(9);
  for (let index = 0; index < 7; index += 1) {
    expect(boxes[index].top).toBe(boxes[0].top);
    expect(boxes[index].right).toBeLessThanOrEqual(boxes[index + 1].left + 0.5);
  }
  expect(boxes[7].top).toBe(boxes[0].top);
  expect(boxes[8].top).toBeGreaterThan(boxes[0].top);
  expect(await roster.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
});
