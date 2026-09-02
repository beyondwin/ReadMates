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
const PEOPLE_MAIN_GEOMETRY = { x: 0, y: 91, width: 1536, height: 1026 } as const;
const RECORDS_HEADER_GEOMETRY = { x: 0, y: 0, width: 1536, height: 91 } as const;
const RECORDS_NAV_GEOMETRY = { x: 800, y: 23, width: 235, height: 44 } as const;
const RECORDS_MAIN_GEOMETRY = { x: 0, y: 91, width: 1536, height: 990 } as const;
const SETTINGS_HEADER_GEOMETRY = { x: 0, y: 0, width: 1536, height: 91 } as const;
const SETTINGS_NAV_GEOMETRY = { x: 800, y: 23, width: 235, height: 44 } as const;
const SETTINGS_MAIN_GEOMETRY = { x: 0, y: 91, width: 1536, height: 1858 } as const;

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
}) {
  const personMobile = input.id === "host-person-mobile";
  const meetingsDesktop = input.id === "host-meetings-desktop";
  const peopleDesktop = input.id === "host-people-desktop";
  const recordsDesktop = input.id === "host-records-desktop";
  const settingsDesktop = input.id === "host-settings-desktop";
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
  return captureApprovedComparison({
    entry: approvedMockup(input.id),
    candidate: input.candidate,
    page: input.page,
    testInfo: input.testInfo,
    regions: input.regions ?? [],
    ...(meetingsDesktop || peopleDesktop || recordsDesktop || settingsDesktop
      ? { skipMismatchRatioAssertion: true as const }
      : {
          allowFontRasterException: true as const,
          fontRasterExceptionMaxRatio: personMobile ? HOST_MOBILE_FONT_RASTER_EXCEPTION_MAX_RATIO : undefined,
        }),
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
  });
});

test("invites and settings match approved desktop", async ({ mount, page }, testInfo) => {
  test.setTimeout(90_000);
  const component = await mountApproved(mount, page, hostSettingsApprovedView(), APPROVED_DESKTOP_VIEWPORT);
  await expect(component.getByRole("link", { name: "초대와 설정" })).toHaveAttribute("aria-current", "page");
  await expect(component.getByRole("button", { name: "새 초대 링크" })).toBeVisible();
  await expect(component.getByRole("heading", { name: "초대 링크" })).toBeVisible();
  await expect(component.getByText(/활성|만료 예정|중지/).first()).toBeVisible();
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
  });
});

test("unread schedule review matches approved desktop", async ({ mount, page }, testInfo) => {
  const component = await mountApproved(mount, page, hostScheduleReviewApprovedView(), APPROVED_DESKTOP_VIEWPORT);
  await expect(component.getByRole("heading", { name: "일정 미열람 검토" })).toBeVisible();
  await expect(component.getByText("미열람 4명").first()).toBeVisible();
  await expect(component.getByRole("button", { name: "4명에게 안내 보내기" })).toBeVisible();
  await captureHostLedger({
    id: "host-schedule-review-desktop",
    candidate: component,
    page,
    testInfo,
  });
});

test("person detail matches approved mobile", async ({ mount, page }, testInfo) => {
  const component = await mountApproved(mount, page, hostPersonApprovedView(), APPROVED_MOBILE_VIEWPORT);
  await expect(component.getByRole("heading", { name: "박서윤" })).toBeVisible();
  await expect(component.getByText("최근 접속", { exact: true })).toBeVisible();
  await expect(component.getByText("일정 확인", { exact: true })).toBeVisible();
  await expect(component.getByText("참석 응답", { exact: true })).toBeVisible();
  await expect(component.getByRole("heading", { name: /실제 출석/ })).toBeVisible();
  await captureHostLedger({
    id: "host-person-mobile",
    candidate: component,
    page,
    testInfo,
  });
});
