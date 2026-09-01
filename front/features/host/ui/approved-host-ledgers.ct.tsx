import { expect, test } from "@playwright/experimental-ct-react";
import type { Locator, Page, TestInfo } from "@playwright/test";
import type { ReactElement } from "react";
import {
  approvedMockup,
  captureApprovedComparison,
  HOST_MOBILE_FONT_RASTER_EXCEPTION_MAX_RATIO,
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
}) {
  const personMobile = input.id === "host-person-mobile";
  return captureApprovedComparison({
    entry: approvedMockup(input.id),
    candidate: input.candidate,
    page: input.page,
    testInfo: input.testInfo,
    regions: [],
    allowFontRasterException: true,
    fontRasterExceptionMaxRatio: personMobile ? HOST_MOBILE_FONT_RASTER_EXCEPTION_MAX_RATIO : undefined,
  });
}

test("people ledger matches approved desktop", async ({ mount, page }, testInfo) => {
  const component = await mountApproved(mount, page, hostPeopleApprovedView(), APPROVED_DESKTOP_VIEWPORT);
  await expect(component.getByRole("heading", { name: "사람" })).toBeVisible();
  await expect(component.getByText("현재 일정 확인").first()).toBeVisible();
  await captureHostLedger({
    id: "host-people-desktop",
    candidate: component,
    page,
    testInfo,
  });
});

test("meetings library matches approved desktop", async ({ mount, page }, testInfo) => {
  const component = await mountApproved(mount, page, hostMeetingsApprovedView(), APPROVED_DESKTOP_VIEWPORT);
  await expect(component.getByRole("heading", { name: "일정과 모임" })).toBeVisible();
  await expect(component.getByRole("link", { name: "지구 끝의 온실" })).toBeVisible();
  await expect(component.getByRole("link", { name: "새 모임 만들기" })).toBeVisible();
  await captureHostLedger({
    id: "host-meetings-desktop",
    candidate: component,
    page,
    testInfo,
  });
});

test("records ledger matches approved desktop", async ({ mount, page }, testInfo) => {
  const component = await mountApproved(mount, page, hostRecordsApprovedView(), APPROVED_DESKTOP_VIEWPORT);
  await expect(component.getByRole("heading", { name: "기록", exact: true })).toBeVisible();
  await expect(component.getByRole("row", { name: /단 한 사람/ })).toBeVisible();
  await expect(component.getByRole("link", { name: /보기·수정/ }).first()).toBeVisible();
  await captureHostLedger({
    id: "host-records-desktop",
    candidate: component,
    page,
    testInfo,
  });
});

test("invites and settings match approved desktop", async ({ mount, page }, testInfo) => {
  const component = await mountApproved(mount, page, hostSettingsApprovedView(), APPROVED_DESKTOP_VIEWPORT);
  await expect(component.getByRole("heading", { name: "초대와 설정" })).toBeVisible();
  await expect(component.getByRole("heading", { name: "공유 링크" })).toBeVisible();
  await expect(component.getByRole("heading", { name: "클럽 기본 설정" })).toBeVisible();
  await captureHostLedger({
    id: "host-settings-desktop",
    candidate: component,
    page,
    testInfo,
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
  await expect(component.getByText("참석 응답", { exact: true })).toBeVisible();
  await expect(component.getByText("실제 출석", { exact: true })).toBeVisible();
  await captureHostLedger({
    id: "host-person-mobile",
    candidate: component,
    page,
    testInfo,
  });
});
