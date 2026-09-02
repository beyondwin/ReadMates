import { expect, test } from "@playwright/experimental-ct-react";
import type { Locator, Page, TestInfo } from "@playwright/test";
import type { ReactElement } from "react";
import {
  approvedMockup,
  captureApprovedComparison,
  expectGeometryWithinTolerance,
  HOST_MOBILE_FONT_RASTER_EXCEPTION_MAX_RATIO,
  type ApprovedRegion,
} from "@/tests/e2e/support/approved-mockup-contract";
import {
  hostMeetingsApprovedView,
  hostPeopleApprovedView,
  hostPersonApprovedView,
  hostRecordsApprovedView,
  hostScheduleReviewApprovedView,
  hostSettingsApprovedView,
} from "./approved-host-ledgers.fixtures";

const APPROVED_DESKTOP_VIEWPORT = { width: 1536, height: 1024 } as const;
const APPROVED_MOBILE_VIEWPORT = { width: 390, height: 832 } as const;
const MEETINGS_HEADER_GEOMETRY = { x: 0, y: 0, width: 1536, height: 91 } as const;
const MEETINGS_NAV_GEOMETRY = { x: 800, y: 23, width: 235, height: 44 } as const;
const MEETINGS_MAIN_GEOMETRY = { x: 0, y: 91, width: 1536, height: 1086 } as const;
const PEOPLE_HEADER_GEOMETRY = { x: 0, y: 0, width: 1536, height: 91 } as const;
const PEOPLE_NAV_GEOMETRY = { x: 800, y: 23, width: 235, height: 44 } as const;
const PEOPLE_MAIN_GEOMETRY = { x: 0, y: 91, width: 1536, height: 1062 } as const;
const RECORDS_HEADER_GEOMETRY = { x: 0, y: 0, width: 1536, height: 91 } as const;
const RECORDS_NAV_GEOMETRY = { x: 800, y: 23, width: 235, height: 44 } as const;
const RECORDS_MAIN_GEOMETRY = { x: 0, y: 91, width: 1536, height: 990 } as const;
const SETTINGS_HEADER_GEOMETRY = { x: 0, y: 0, width: 1536, height: 91 } as const;
const SETTINGS_NAV_GEOMETRY = { x: 800, y: 23, width: 235, height: 44 } as const;
const SETTINGS_MAIN_GEOMETRY = { x: 0, y: 91, width: 1536, height: 1052 } as const;
const SCHEDULE_REVIEW_HEADER_GEOMETRY = { x: 0, y: 0, width: 1536, height: 91 } as const;
const SCHEDULE_REVIEW_NAV_GEOMETRY = { x: 800, y: 23, width: 235, height: 44 } as const;
const SCHEDULE_REVIEW_MAIN_GEOMETRY = { x: 0, y: 91, width: 1536, height: 943 } as const;
const PERSON_HEADER_GEOMETRY = { x: 17, y: 58, width: 356, height: 143 } as const;
const PERSON_NAV_GEOMETRY = { x: 0, y: 768, width: 390, height: 64 } as const;
const PERSON_MAIN_GEOMETRY = { x: 1, y: 58, width: 388, height: 737 } as const;

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

async function captureHostLedger(input: {
  id:
    | "host-meetings-desktop"
    | "host-people-desktop"
    | "host-records-desktop"
    | "host-settings-desktop"
    | "host-schedule-review-desktop"
    | "host-person-mobile";
  candidate: Locator;
  page: Page;
  testInfo: TestInfo;
  regions?: readonly ApprovedRegion[];
  allowFontRasterException?: boolean;
  fontRasterExceptionMaxRatio?: number;
  skipMismatchRatioAssertion?: boolean;
}) {
  const personMobile = input.id === "host-person-mobile";
  const meetingsDesktop = input.id === "host-meetings-desktop";
  const peopleDesktop = input.id === "host-people-desktop";
  const recordsDesktop = input.id === "host-records-desktop";
  const settingsDesktop = input.id === "host-settings-desktop";
  const scheduleReviewDesktop = input.id === "host-schedule-review-desktop";
  if (meetingsDesktop && (!input.regions || input.regions.length === 0)) {
    throw new Error("host-meetings-desktop requires nav and main capture regions");
  }
  if (peopleDesktop && (!input.regions || input.regions.length === 0)) {
    throw new Error("host-people-desktop requires nav and main capture regions");
  }
  if (recordsDesktop && (!input.regions || input.regions.length === 0)) {
    throw new Error("host-records-desktop requires nav and main capture regions");
  }
  if (settingsDesktop && (!input.regions || input.regions.length === 0)) {
    throw new Error("host-settings-desktop requires nav and main capture regions");
  }
  if (scheduleReviewDesktop && (!input.regions || input.regions.length === 0)) {
    throw new Error("host-schedule-review-desktop requires nav and main capture regions");
  }
  if (personMobile && (!input.regions || input.regions.length === 0)) {
    throw new Error("host-person-mobile requires nav and main capture regions");
  }
  return captureApprovedComparison({
    entry: approvedMockup(input.id),
    candidate: input.candidate,
    page: input.page,
    testInfo: input.testInfo,
    regions: input.regions ?? [],
    allowFontRasterException: input.allowFontRasterException,
    fontRasterExceptionMaxRatio: input.fontRasterExceptionMaxRatio,
    skipMismatchRatioAssertion: input.skipMismatchRatioAssertion ?? false,
  });
}

test("people ledger matches approved desktop", async ({ mount, page }, testInfo) => {
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
  const peopleFrame = { x: 0, y: 0, width: APPROVED_DESKTOP_VIEWPORT.width, height: APPROVED_DESKTOP_VIEWPORT.height };
  for (const name of ["윤서진", "최도윤", "김하늘", "박서윤", "이도현", "정수아", "한지우", "오민재"]) {
    const locator = component.getByText(name, { exact: true });
    await expect(locator).toBeVisible();
    const box = await locator.boundingBox();
    expect(box, `${name} bounding box`).not.toBeNull();
    expect(box!.width, `${name} width`).toBeGreaterThan(12);
    expect(box!.height, `${name} height`).toBeGreaterThan(10);
    expect(box!.y).toBeGreaterThanOrEqual(peopleFrame.y);
    expect(
      box!.y + box!.height,
      `${name} y=${box!.y} h=${box!.height} must stay inside 1536×1024`,
    ).toBeLessThanOrEqual(peopleFrame.height);
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
  expect(
    openBox!.y + openBox!.height,
    `열기 y=${openBox!.y} h=${openBox!.height} must stay inside 1536×1024`,
  ).toBeLessThanOrEqual(peopleFrame.height);
  const header = component.locator("header.topnav");
  const nav = component.getByRole("navigation", { name: "호스트 주 메뉴" });
  const main = component.getByRole("main");
  await expect(header).toBeVisible();
  await expect(nav).toBeVisible();
  await expect(main).toBeVisible();
  const regions = [
    await regionFromLocator(header, "header", PEOPLE_HEADER_GEOMETRY, 4),
    await regionFromLocator(nav, "nav", PEOPLE_NAV_GEOMETRY, 4),
    await regionFromLocator(main, "main", PEOPLE_MAIN_GEOMETRY, 4),
  ];
  await captureHostLedger({
    id: "host-people-desktop",
    candidate: component,
    page,
    testInfo,
    regions,
    allowFontRasterException: true,
    skipMismatchRatioAssertion: false,
  });
});

test("meetings library matches approved desktop", async ({ mount, page }, testInfo) => {
  test.setTimeout(90_000);
  const component = await mountApproved(mount, page, hostMeetingsApprovedView(), APPROVED_DESKTOP_VIEWPORT);
  await expect(component.getByRole("link", { name: "일정과 모임" })).toHaveAttribute("aria-current", "page");
  await expect(component.getByRole("tab", { name: "목록" })).toBeVisible();
  await expect(component.getByRole("tab", { name: "달력" })).toBeVisible();
  await expect(component.getByRole("link", { name: "새 모임 만들기" })).toBeVisible();
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
  const regions = [
    await regionFromLocator(header, "header", MEETINGS_HEADER_GEOMETRY, 4),
    await regionFromLocator(nav, "nav", MEETINGS_NAV_GEOMETRY, 4),
    await regionFromLocator(main, "main", MEETINGS_MAIN_GEOMETRY, 4),
  ];
  await captureHostLedger({
    id: "host-meetings-desktop",
    candidate: component,
    page,
    testInfo,
    regions,
    allowFontRasterException: true,
    skipMismatchRatioAssertion: false,
  });
});

test("records ledger matches approved desktop", async ({ mount, page }, testInfo) => {
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
  const regions = [
    await regionFromLocator(header, "header", RECORDS_HEADER_GEOMETRY, 4),
    await regionFromLocator(nav, "nav", RECORDS_NAV_GEOMETRY, 4),
    await regionFromLocator(main, "main", RECORDS_MAIN_GEOMETRY, 4),
  ];
  await captureHostLedger({
    id: "host-records-desktop",
    candidate: component,
    page,
    testInfo,
    regions,
    allowFontRasterException: true,
    skipMismatchRatioAssertion: false,
  });
});

test("invites and settings match approved desktop", async ({ mount, page }, testInfo) => {
  test.setTimeout(90_000);
  const component = await mountApproved(mount, page, hostSettingsApprovedView(), APPROVED_DESKTOP_VIEWPORT);
  await expect(component.getByRole("link", { name: "초대와 설정" })).toHaveAttribute("aria-current", "page");
  await expect(component.getByRole("button", { name: "새 초대 링크" })).toBeVisible();
  await expect(component.getByRole("heading", { name: "초대 링크" })).toBeVisible();
  await expect(component.getByText(/활성|만료 예정|중지/).first()).toBeVisible();
  await expect(component.getByLabel("링크 이름")).toHaveCount(0);
  const closeHeading = component.getByRole("heading", { name: "클럽 운영 종료" });
  await expect(closeHeading).toBeVisible();
  const closeBox = await closeHeading.boundingBox();
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
  const regions = [
    await regionFromLocator(header, "header", SETTINGS_HEADER_GEOMETRY, 4),
    await regionFromLocator(nav, "nav", SETTINGS_NAV_GEOMETRY, 4),
    await regionFromLocator(main, "main", SETTINGS_MAIN_GEOMETRY, 4),
  ];
  await captureHostLedger({
    id: "host-settings-desktop",
    candidate: component,
    page,
    testInfo,
    regions,
    allowFontRasterException: true,
    skipMismatchRatioAssertion: false,
  });
  await component.getByRole("button", { name: "새 초대 링크" }).click();
  await expect(component.getByLabel("링크 이름")).toBeVisible();
});

test("unread schedule review matches approved desktop", async ({ mount, page }, testInfo) => {
  test.setTimeout(90_000);
  const component = await mountApproved(mount, page, hostScheduleReviewApprovedView(), APPROVED_DESKTOP_VIEWPORT);
  await expect(component.getByRole("link", { name: "운영실", exact: true })).toHaveAttribute("aria-current", "page");
  await expect(component.getByRole("heading", { name: "일정 미열람 검토" })).toBeVisible();
  await expect(component.getByRole("heading", { name: "안내 대상 4명" })).toBeVisible();
  await expect(component.getByRole("heading", { name: "보낼 안내" })).toBeVisible();
  await expect(component.getByText("미열람 4명").first()).toBeVisible();
  const send = component.getByRole("button", { name: "4명에게 안내 보내기" });
  await expect(send).toBeVisible();
  const sendBox = await send.boundingBox();
  expect(sendBox, "4명에게 안내 보내기 first-viewport").not.toBeNull();
  expect(sendBox!.y).toBeGreaterThanOrEqual(0);
  expect(
    sendBox!.y + sendBox!.height,
    `send button bottom ${sendBox!.y + sendBox!.height} must stay inside 1536×1024`,
  ).toBeLessThanOrEqual(APPROVED_DESKTOP_VIEWPORT.height);
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
  const header = component.locator("header.topnav");
  const nav = component.getByRole("navigation", { name: "호스트 주 메뉴" });
  const main = component.getByRole("main");
  await expect(header).toBeVisible();
  await expect(nav).toBeVisible();
  await expect(main).toBeVisible();
  const regions = [
    await regionFromLocator(header, "header", SCHEDULE_REVIEW_HEADER_GEOMETRY, 4),
    await regionFromLocator(nav, "nav", SCHEDULE_REVIEW_NAV_GEOMETRY, 4),
    await regionFromLocator(main, "main", SCHEDULE_REVIEW_MAIN_GEOMETRY, 4),
  ];
  await captureHostLedger({
    id: "host-schedule-review-desktop",
    candidate: component,
    page,
    testInfo,
    regions,
    allowFontRasterException: true,
    skipMismatchRatioAssertion: false,
  });
});

test("person detail matches approved mobile", async ({ mount, page }, testInfo) => {
  test.setTimeout(90_000);
  const component = await mountApproved(mount, page, hostPersonApprovedView(), APPROVED_MOBILE_VIEWPORT);
  await expect(component.getByRole("link", { name: "사람 목록으로" })).toBeVisible();
  await expect(component.getByRole("link", { name: "내 클럽" })).toHaveCount(0);
  await expect(component.getByText(/No\.\s*\d+|FOLIO|회차/)).toBeVisible();
  await expect(component.getByText("현재 일정")).toBeVisible();
  await expect(component.getByText("참석 응답")).toBeVisible();
  await expect(component.getByText("실제 출석")).toBeVisible();
  await expect(component.getByText("멤버십")).toBeVisible();
  await expect(component.getByRole("heading", { name: "박서윤" })).toBeVisible();
  await expect(component.getByRole("link", { name: "사람", exact: true })).toHaveAttribute("aria-current", "page");
  const header = component.locator(".rm-host-person__header");
  const nav = component.locator('[data-club-shell-region="mobile-primary"]');
  const main = component.getByRole("main");
  await expect(header).toBeVisible();
  await expect(nav).toBeVisible();
  await expect(main).toBeVisible();
  const membership = component.getByRole("heading", { name: "멤버십" });
  const membershipCta = component.getByRole("link", { name: "사람 관리 원장으로" });
  await expect(membership).toBeVisible();
  await expect(membershipCta).toBeVisible();
  const navBox = await nav.boundingBox();
  expect(navBox, "bottom-nav").not.toBeNull();
  expect(navBox!.y).toBeGreaterThanOrEqual(APPROVED_MOBILE_VIEWPORT.height - 140);
  expect(navBox!.y + navBox!.height).toBeLessThanOrEqual(APPROVED_MOBILE_VIEWPORT.height + 1);
  for (const [name, locator] of [
    ["04 멤버십", membership],
    ["사람 관리 원장으로", membershipCta],
  ] as const) {
    const box = await locator.boundingBox();
    expect(box, name).not.toBeNull();
    expect(
      box!.y + box!.height,
      `${name} y=${box!.y} h=${box!.height} navY=${navBox!.y}`,
    ).toBeLessThanOrEqual(navBox!.y + 2);
  }
  const regions = [
    await regionFromLocator(header, "header", PERSON_HEADER_GEOMETRY, 4),
    await regionFromLocator(nav, "nav", PERSON_NAV_GEOMETRY, 4),
    await regionFromLocator(main, "main", PERSON_MAIN_GEOMETRY, 4),
  ];
  await captureHostLedger({
    id: "host-person-mobile",
    candidate: component,
    page,
    testInfo,
    regions,
    allowFontRasterException: true,
    fontRasterExceptionMaxRatio: HOST_MOBILE_FONT_RASTER_EXCEPTION_MAX_RATIO,
    skipMismatchRatioAssertion: false,
  });
});
