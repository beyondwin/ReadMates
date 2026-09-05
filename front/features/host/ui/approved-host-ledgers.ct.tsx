import { expect, test } from "@playwright/experimental-ct-react";
import type { Locator, Page } from "@playwright/test";
import type { ReactElement } from "react";
import {
  expectGeometryWithinTolerance,
  type ApprovedRegion,
} from "@/tests/e2e/support/approved-mockup-contract";
import {
  hostMeetingsApprovedView,
  hostPeopleApprovedView,
  hostPersonApprovedView,
  hostRecordsApprovedView,
  hostScheduleReviewApprovedView,
} from "./approved-host-ledgers.fixtures";
import { HostSettingsApprovedStory } from "./approved-host-settings.story";
import {
  HOST_MEETINGS_HEADER_GEOMETRY as MEETINGS_HEADER_GEOMETRY,
  HOST_MEETINGS_MAIN_GEOMETRY as MEETINGS_MAIN_GEOMETRY,
  HOST_MEETINGS_NAV_GEOMETRY as MEETINGS_NAV_GEOMETRY,
  HOST_MOBILE_NAV_GEOMETRY as PERSON_NAV_GEOMETRY,
  HOST_PEOPLE_HEADER_GEOMETRY as PEOPLE_HEADER_GEOMETRY,
  HOST_PEOPLE_MAIN_GEOMETRY as PEOPLE_MAIN_GEOMETRY,
  HOST_PEOPLE_NAV_GEOMETRY as PEOPLE_NAV_GEOMETRY,
  HOST_PERSON_HEADER_GEOMETRY as PERSON_HEADER_GEOMETRY,
  HOST_PERSON_MAIN_GEOMETRY as PERSON_MAIN_GEOMETRY,
  HOST_RECORDS_HEADER_GEOMETRY as RECORDS_HEADER_GEOMETRY,
  HOST_RECORDS_MAIN_GEOMETRY as RECORDS_MAIN_GEOMETRY,
  HOST_RECORDS_NAV_GEOMETRY as RECORDS_NAV_GEOMETRY,
  HOST_SCHEDULE_REVIEW_HEADER_GEOMETRY as SCHEDULE_REVIEW_HEADER_GEOMETRY,
  HOST_SCHEDULE_REVIEW_MAIN_GEOMETRY as SCHEDULE_REVIEW_MAIN_GEOMETRY,
  HOST_SCHEDULE_REVIEW_NAV_GEOMETRY as SCHEDULE_REVIEW_NAV_GEOMETRY,
  HOST_SETTINGS_HEADER_GEOMETRY as SETTINGS_HEADER_GEOMETRY,
  HOST_SETTINGS_MAIN_GEOMETRY as SETTINGS_MAIN_GEOMETRY,
  HOST_SETTINGS_NAV_GEOMETRY as SETTINGS_NAV_GEOMETRY,
} from "@/tests/e2e/support/approved-route-geometry";

const APPROVED_DESKTOP_VIEWPORT = { width: 1536, height: 1024 } as const;
const APPROVED_MOBILE_VIEWPORT = { width: 390, height: 832 } as const;

function boxesOverlap(
  left: { x: number; y: number; width: number; height: number },
  right: { x: number; y: number; width: number; height: number },
) {
  return left.x < right.x + right.width
    && left.x + left.width > right.x
    && left.y < right.y + right.height
    && left.y + left.height > right.y;
}

async function mountApproved(
  mount: (component: ReactElement) => Promise<Locator>,
  page: Page,
  node: ReactElement,
  viewport: { width: number; height: number },
) {
  await page.setViewportSize(viewport);
  await page.emulateMedia({ colorScheme: "light" });
  await page.addStyleTag({
    content: "html, body, #root, .rm-app-club-shell { height: 100%; margin: 0; overflow: hidden; }",
  });
  const component = await mount(node);
  await page.evaluate(() => document.fonts.ready);
  return component;
}

async function regionFromLocator(
  locator: Locator,
  name: string,
  expected: ApprovedRegion["expected"],
  toleranceCssPx: 2 | 4,
): Promise<ApprovedRegion> {
  const box = await locator.boundingBox();
  if (!box) throw new Error(`${name} has no bounding box`);
  const actual = { x: box.x, y: box.y, width: box.width, height: box.height };
  try {
    expectGeometryWithinTolerance(actual, expected, toleranceCssPx);
  } catch (error) {
    throw new Error(
      `${name} actual=${JSON.stringify(actual)} expected=${JSON.stringify(expected)}`,
      { cause: error },
    );
  }
  return { name, actual, expected, toleranceCssPx };
}

test("people ledger matches approved desktop", async ({ mount, page }) => {
  test.setTimeout(90_000);
  const component = await mountApproved(mount, page, hostPeopleApprovedView(), APPROVED_DESKTOP_VIEWPORT);
  await expect(component.getByRole("link", { name: "사람" })).toHaveAttribute("aria-current", "page");
  await expect(component.getByRole("searchbox", { name: /이름/ })).toBeVisible();
  await expect(component.getByRole("region", { name: "가입 승인 대기" })).toBeVisible();
  await expect(component.getByText(/가입 승인 대기\s+\d+명/)).toBeVisible();
  await expect(component.getByRole("button", { name: "가입 승인 검토" })).toBeVisible();
  await expect(component.getByRole("button", { name: "검토" }).first()).toBeVisible();
  await expect(component.getByRole("button", { name: "거절" })).toHaveCount(0);
  await expect(component.getByRole("tab", { name: /전체/ })).toBeVisible();
  await expect(component.getByRole("tab", { name: /활동/ })).toBeVisible();
  await expect(component.getByRole("tab", { name: /둘러보기/ })).toBeVisible();
  await expect(component.getByRole("tab", { name: /쉬는 중/ })).toBeVisible();
  await expect(component.getByRole("columnheader", { name: "멤버" })).toBeVisible();
  await expect(component.getByRole("columnheader", { name: "상태" })).toBeVisible();
  await expect(component.getByRole("columnheader", { name: "최신 일정" })).toBeVisible();
  await expect(component.getByRole("columnheader", { name: "참석 응답" })).toBeVisible();
  await expect(component.getByRole("columnheader", { name: "최근 접속" })).toBeVisible();
  await expect(component.getByRole("columnheader", { name: "함께한 기간" })).toBeVisible();
  await expect(component.getByRole("columnheader", { name: "관리" })).toBeVisible();
  const header = component.locator("header.topnav");
  const nav = component.getByRole("navigation", { name: "호스트 주 메뉴" });
  const main = component.getByRole("main");
  await expect(header).toBeVisible();
  await expect(nav).toBeVisible();
  await expect(main).toBeVisible();
  await regionFromLocator(header, "header", PEOPLE_HEADER_GEOMETRY, 4);
  await regionFromLocator(nav, "nav", PEOPLE_NAV_GEOMETRY, 4);
  await regionFromLocator(main, "main", PEOPLE_MAIN_GEOMETRY, 4);
  const peopleFrame = { x: 0, y: 0, width: APPROVED_DESKTOP_VIEWPORT.width, height: APPROVED_DESKTOP_VIEWPORT.height };
  for (const name of ["윤서진", "최도윤", "김하늘", "박서윤", "이도현", "정수아", "한지우", "오민재"]) {
    const locator = component.getByText(name, { exact: true });
    await expect(locator).toBeVisible();
    const box = await locator.boundingBox();
    expect(box, `${name} bounding box`).not.toBeNull();
    expect(box!.width, `${name} width`).toBeGreaterThan(12);
    expect(box!.height, `${name} height`).toBeGreaterThan(10);
    expect(box!.y).toBeGreaterThanOrEqual(peopleFrame.y);
    const fontSize = await locator.evaluate((node) => Number.parseFloat(getComputedStyle(node).fontSize));
    expect(fontSize, `${name} font-size`).toBeGreaterThan(10);
    expect(await locator.evaluate((node) => getComputedStyle(node).fontSize)).not.toBe("0px");
    expect(await locator.evaluate((node) => getComputedStyle(node, "::after").content)).toBe("none");
  }
  const openLinks = component.getByRole("link", { name: "열기" });
  await expect(openLinks).toHaveCount(6);
  const firstOpen = openLinks.first();
  await expect(firstOpen).toBeVisible();
  const openBox = await firstOpen.boundingBox();
  expect(openBox, "관리 열기 bounding box").not.toBeNull();
  expect(openBox!.width).toBeGreaterThan(12);
  expect(openBox!.height).toBeGreaterThan(10);
});

test("meetings library matches approved desktop", async ({ mount, page }) => {
  test.setTimeout(90_000);
  const component = await mountApproved(mount, page, hostMeetingsApprovedView(), APPROVED_DESKTOP_VIEWPORT);
  await expect(component.getByRole("link", { name: "일정과 모임" })).toHaveAttribute("aria-current", "page");
  await expect(component.getByRole("tab", { name: "목록" })).toBeVisible();
  await expect(component.getByRole("tab", { name: "달력" })).toBeVisible();
  await expect(component.getByRole("link", { name: "새 모임 만들기" })).toHaveCount(0);
  await expect(component.getByRole("link", { name: "지구 끝의 온실", exact: true })).toBeVisible();
  await expect(component.getByText("맡겨진 소녀")).toBeVisible();
  await expect(component.getByRole("tab", { name: "전체" })).toBeVisible();
  await expect(component.getByRole("tab", { name: "준비 중" })).toBeVisible();
  await expect(component.getByRole("columnheader", { name: "모임" }).first()).toBeVisible();
  await expect(component.getByRole("columnheader", { name: "일정" }).first()).toBeVisible();
  await expect(component.getByRole("columnheader", { name: "상태" }).first()).toBeVisible();
  await expect(component.getByRole("columnheader", { name: "요약" }).first()).toBeVisible();
  await expect(component.getByRole("columnheader", { name: "작업" }).first()).toBeVisible();
  await expect(component.getByRole("link", { name: "운영실 열기" })).toBeVisible();
  await expect(component.getByRole("link", { name: "마감실 열기" })).toBeVisible();
  await expect(component.getByText("기록 확인 필요")).toHaveCount(0);
  await expect(component.getByText("현재 모임")).toBeVisible();
  await expect(component.getByText("다음 모임")).toBeVisible();
  await expect(component.getByRole("button", { name: "달력에서 보기" })).toBeVisible();
  await expect(component.getByText("작별하지 않는다", { exact: true })).toBeVisible();
  const brandText = (await component.getByRole("link", { name: "ReadMates" }).innerText()).replace(/\s+/g, "");
  expect(brandText).toBe("ReadMates");
  const header = component.locator("header.topnav");
  const nav = component.getByRole("navigation", { name: "호스트 주 메뉴" });
  const main = component.getByRole("main");
  const viewTabs = component.getByRole("tablist", { name: "모임 보기 방식" });
  const statusChips = component.getByRole("tablist", { name: "모임 상태" });
  await expect(header).toBeVisible();
  await expect(nav).toBeVisible();
  await expect(main).toBeVisible();
  await expect(component.getByRole("tab", { name: "목록" })).toHaveAttribute("aria-selected", "true");
  for (const locator of [viewTabs, statusChips]) {
    const box = await locator.boundingBox();
    expect(box, "first-viewport control").not.toBeNull();
    expect(box!.y).toBeGreaterThanOrEqual(0);
    expect(box!.y + box!.height).toBeLessThanOrEqual(APPROVED_DESKTOP_VIEWPORT.height);
  }
  await regionFromLocator(header, "header", MEETINGS_HEADER_GEOMETRY, 4);
  await regionFromLocator(nav, "nav", MEETINGS_NAV_GEOMETRY, 4);
  await regionFromLocator(main, "main", MEETINGS_MAIN_GEOMETRY, 4);
});

test("records ledger matches approved desktop", async ({ mount, page }) => {
  test.setTimeout(90_000);
  const component = await mountApproved(mount, page, hostRecordsApprovedView(), APPROVED_DESKTOP_VIEWPORT);
  await expect(component.getByRole("link", { name: "기록", exact: true })).toHaveAttribute("aria-current", "page");
  await expect(component.getByRole("link", { name: /마감실 열기/ }).first()).toBeVisible();
  await expect(component.getByRole("row", { name: /단 한 사람/ })).toBeVisible();
  const header = component.locator("header.topnav");
  const nav = component.getByRole("navigation", { name: "호스트 주 메뉴" });
  const main = component.getByRole("main");
  await expect(header).toBeVisible();
  await expect(nav).toBeVisible();
  await expect(main).toBeVisible();
  await regionFromLocator(header, "header", RECORDS_HEADER_GEOMETRY, 4);
  await regionFromLocator(nav, "nav", RECORDS_NAV_GEOMETRY, 4);
  await regionFromLocator(main, "main", RECORDS_MAIN_GEOMETRY, 4);
});

test("invites and settings match approved desktop", async ({ mount, page }) => {
  test.setTimeout(90_000);
  const component = await mountApproved(mount, page, <HostSettingsApprovedStory />, APPROVED_DESKTOP_VIEWPORT);
  await expect(component.getByRole("link", { name: "초대와 설정" })).toHaveAttribute("aria-current", "page");
  await expect(component.getByRole("button", { name: "새 초대 링크" })).toBeVisible();
  await expect(component.getByRole("heading", { name: "초대 링크" })).toBeVisible();
  await expect(component.getByText(/활성|만료 예정|중지/).first()).toBeVisible();
  await expect(component.getByLabel("링크 이름")).toHaveCount(0);
  const closeRow = component.locator(".rm-host-settings__end");
  await expect(closeRow).toBeVisible();
  const closeBox = await closeRow.boundingBox();
  expect(closeBox, "클럽 운영 종료 first-viewport").not.toBeNull();
  expect(closeBox!.y).toBeGreaterThanOrEqual(0);
  expect(closeBox!.y + closeBox!.height).toBeLessThanOrEqual(APPROVED_DESKTOP_VIEWPORT.height);
  const settingsHeading = component.getByRole("heading", { name: "클럽 설정" });
  const settingsBox = await settingsHeading.boundingBox();
  expect(settingsBox, "클럽 설정 first-viewport").not.toBeNull();
  expect(settingsBox!.y + settingsBox!.height).toBeLessThanOrEqual(APPROVED_DESKTOP_VIEWPORT.height);
  const header = component.locator("header.topnav");
  const nav = component.getByRole("navigation", { name: "호스트 주 메뉴" });
  const main = component.getByRole("main");
  await expect(header).toBeVisible();
  await expect(nav).toBeVisible();
  await expect(main).toBeVisible();
  await regionFromLocator(header, "header", SETTINGS_HEADER_GEOMETRY, 4);
  await regionFromLocator(nav, "nav", SETTINGS_NAV_GEOMETRY, 4);
  await regionFromLocator(main, "main", SETTINGS_MAIN_GEOMETRY, 4);
  await component.getByRole("button", { name: "새 초대 링크" }).click();
  await expect(component.getByLabel("링크 이름")).toBeVisible();
});

test("unread schedule review matches approved desktop", async ({ mount, page }) => {
  test.setTimeout(90_000);
  const component = await mountApproved(mount, page, hostScheduleReviewApprovedView(), APPROVED_DESKTOP_VIEWPORT);
  await expect(
    component.getByRole("navigation", { name: "호스트 주 메뉴" }).getByRole("link", { name: "운영실", exact: true }),
  ).toHaveAttribute("aria-current", "page");
  await expect(component.getByRole("heading", { name: "일정 미열람 안내" })).toBeVisible();
  await expect(component.getByRole("heading", { name: "안내 대상 4명" })).toBeVisible();
  await expect(component.getByRole("heading", { name: "보낼 안내" })).toBeVisible();
  await expect(component.getByText("미열람 4명").first()).toBeVisible();
  const header = component.locator("header.topnav");
  const nav = component.getByRole("navigation", { name: "호스트 주 메뉴" });
  const main = component.getByRole("main");
  await expect(header).toBeVisible();
  await expect(nav).toBeVisible();
  await expect(main).toBeVisible();
  await regionFromLocator(header, "header", SCHEDULE_REVIEW_HEADER_GEOMETRY, 4);
  await regionFromLocator(nav, "nav", SCHEDULE_REVIEW_NAV_GEOMETRY, 4);
  await regionFromLocator(main, "main", SCHEDULE_REVIEW_MAIN_GEOMETRY, 4);
  const send = component.getByRole("button", { name: "4명에게 안내 보내기" });
  await expect(send).toBeVisible();
  const sendBox = await send.boundingBox();
  expect(sendBox, "4명에게 안내 보내기 first-viewport").not.toBeNull();
  expect(sendBox!.y).toBeGreaterThanOrEqual(0);
  const fields = component.locator("input, textarea, [role='checkbox']");
  expect(await fields.count()).toBeGreaterThan(3);
  const recipients = component.locator(".rm-schedule-review__recipients");
  const composer = component.locator(".rm-schedule-review__composer");
  await expect(recipients).toBeVisible();
  await expect(composer).toBeVisible();
  const recipientBox = await recipients.boundingBox();
  const composerBox = await composer.boundingBox();
  expect(recipientBox, "recipient list bounding box").not.toBeNull();
  expect(composerBox, "message composer bounding box").not.toBeNull();
  expect(
    boxesOverlap(recipientBox!, composerBox!),
    `recipient ${JSON.stringify(recipientBox)} overlaps composer ${JSON.stringify(composerBox)}`,
  ).toBe(false);
  expect(
    recipientBox!.x + recipientBox!.width,
    "two-column layout at 1536px must keep recipients left of the composer",
  ).toBeLessThanOrEqual(composerBox!.x + 4);
});

test("person detail matches approved mobile", async ({ mount, page }) => {
  test.setTimeout(90_000);
  const component = await mountApproved(mount, page, hostPersonApprovedView(), APPROVED_MOBILE_VIEWPORT);
  await expect(component.locator(".rm-person-detail__back")).toBeVisible();
  await expect(component.getByRole("link", { name: "내 클럽" })).toHaveCount(0);
  await expect(component.getByText(/No\.\s*\d+|FOLIO|회차/)).toBeVisible();
  await expect(component.getByRole("heading", { name: "현재 일정" })).toBeVisible();
  await expect(component.getByRole("heading", { name: "참석 응답" })).toBeVisible();
  await expect(component.getByRole("heading", { name: "실제 출석" })).toBeVisible();
  await expect(component.getByRole("heading", { name: "멤버십" })).toBeVisible();
  await expect(component.getByRole("heading", { name: "박서윤" })).toBeVisible();
  await expect(component.locator('[data-club-shell-region="mobile-primary"]').getByRole("link", { name: "사람", exact: true })).toHaveAttribute("aria-current", "page");
  const header = component.locator(".rm-person-detail__header");
  const nav = component.locator('[data-club-shell-region="mobile-primary"]');
  const main = component.getByRole("main");
  await expect(header).toBeVisible();
  await expect(nav).toBeVisible();
  await expect(main).toBeVisible();
  await expect(component.getByRole("heading", { name: "멤버십" })).toBeVisible();
  await expect(component.getByRole("link", { name: "멤버 정보 관리" })).toBeVisible();
  const navBox = await nav.boundingBox();
  expect(navBox, "bottom-nav").not.toBeNull();
  expect(navBox!.y).toBeGreaterThanOrEqual(APPROVED_MOBILE_VIEWPORT.height - 140);
  expect(navBox!.y + navBox!.height).toBeLessThanOrEqual(APPROVED_MOBILE_VIEWPORT.height + 1);
  await regionFromLocator(header, "header", PERSON_HEADER_GEOMETRY, 4);
  await regionFromLocator(nav, "nav", PERSON_NAV_GEOMETRY, 4);
  await regionFromLocator(main, "main", PERSON_MAIN_GEOMETRY, 4);
});
