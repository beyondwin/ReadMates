import { expect, test } from "@playwright/experimental-ct-react";
import type { Locator, Page } from "@playwright/test";
import type { ReactElement } from "react";
import type { SessionClosingBoardView } from "@/features/host/model/session-closing-model";
import {
  VISUAL_AUTHORITY_VIEWPORTS,
  expectNoHorizontalOverflow,
  expectReducedMotion,
} from "@/tests/e2e/support/visual-authority-contract";
import { SessionClosingBoard } from "./session-closing-board";

const blockedView: SessionClosingBoardView = {
  title: "No.07 · 마감 점검 책",
  subtitle: "2026-06-18 · Public",
  statusLabel: "차단",
  statusTone: "danger",
  primaryAction: {
    label: "기록 패키지 검토",
    reason: "요약, 하이라이트, 한줄평, 피드백 문서가 아직 마감 증거로 충분하지 않습니다.",
    tone: "danger",
    href: "/app/host/sessions/11111111-1111-1111-1111-111111111111/edit?records=json",
  },
  checklist: [
    {
      id: "SESSION_CLOSED",
      label: "출석 확정",
      detail: "세션은 닫혔습니다.",
      state: "DONE",
      stateLabel: "완료",
      tone: "ok",
      href: "/app/host/sessions/11111111-1111-1111-1111-111111111111/edit",
      actionLabel: "확인하기",
      completedStamp: "2026-06-18",
    },
    {
      id: "RECORD_PACKAGE_SAVED",
      label: "기록 패키지 저장",
      detail: "공개 요약과 하이라이트를 다시 확인해야 합니다.",
      state: "ACTION_REQUIRED",
      stateLabel: "조치 필요",
      tone: "warn",
      href: "/app/host/sessions/11111111-1111-1111-1111-111111111111/edit?records=json",
      actionLabel: "확인하기",
      completedStamp: null,
    },
    {
      id: "FEEDBACK_DOCUMENT_READY",
      label: "소감 수집",
      detail: "피드백 문서 parser 상태를 확인해야 합니다.",
      state: "BLOCKED",
      stateLabel: "차단",
      tone: "danger",
      href: null,
      actionLabel: "상태 확인",
      completedStamp: null,
    },
    {
      id: "MEMBER_NOTIFICATION_SENT",
      label: "멤버 알림",
      detail: "멤버 알림이 아직 발송되지 않았습니다.",
      state: "ACTION_REQUIRED",
      stateLabel: "조치 필요",
      tone: "warn",
      href: "/app/host/notifications",
      actionLabel: "수동 발송",
      completedStamp: null,
    },
    {
      id: "PUBLIC_RECORD_VISIBLE",
      label: "공개 기록",
      detail: "공개 표면에는 아직 발행되지 않았습니다.",
      state: "BLOCKED",
      stateLabel: "차단",
      tone: "danger",
      href: null,
      actionLabel: "상태 확인",
      completedStamp: null,
    },
  ],
  surfaces: [
    {
      id: "HOST",
      title: "호스트 문서",
      detail: "호스트가 기록 패키지와 마감 상태를 관리할 수 있습니다.",
      tone: "danger",
      href: "/app/host/sessions/11111111-1111-1111-1111-111111111111/edit",
      actionLabel: "호스트 문서 확인",
    },
    {
      id: "MEMBER",
      title: "멤버 회고",
      detail: "멤버 회고 진입은 아직 확인되지 않았습니다.",
      tone: "muted",
      href: null,
      actionLabel: "멤버 회고 확인",
    },
    {
      id: "PUBLIC",
      title: "공개 기록",
      detail: "공개 표면에는 아직 발행되지 않았습니다.",
      tone: "muted",
      href: null,
      actionLabel: "공개 기록 확인",
    },
  ],
  evidence: [
    { label: "공개 요약", value: "없음" },
    { label: "하이라이트", value: "0" },
    { label: "한줄평", value: "0" },
    { label: "피드백 문서", value: "확인 필요" },
    { label: "최근 멤버 알림", value: "없음" },
  ],
};

const publishedView: SessionClosingBoardView = {
  title: "No.08 · 공개 완료 책",
  subtitle: "2026-06-25 · Public",
  statusLabel: "발행 완료",
  statusTone: "ok",
  primaryAction: {
    label: "추가 조치 없음",
    reason: "마감에 필요한 증거가 준비되어 있고 공개 기록과 멤버 회고 진입이 모두 확인되었습니다.",
    tone: "ok",
    href: null,
  },
  checklist: [
    {
      id: "SESSION_CLOSED",
      label: "출석 확정",
      detail: "세션은 닫혔습니다.",
      state: "DONE",
      stateLabel: "완료",
      tone: "ok",
      href: "/app/host/sessions/22222222-2222-2222-2222-222222222222/edit",
      actionLabel: "확인하기",
      completedStamp: "2026-06-18",
    },
    {
      id: "RECORD_PACKAGE_SAVED",
      label: "기록 패키지 저장",
      detail: "공개 요약, 하이라이트, 한줄평이 저장되었습니다.",
      state: "DONE",
      stateLabel: "완료",
      tone: "ok",
      href: "/app/host/sessions/22222222-2222-2222-2222-222222222222/edit?records=json",
      actionLabel: "확인하기",
      completedStamp: "저장됨",
    },
    {
      id: "FEEDBACK_DOCUMENT_READY",
      label: "소감 수집",
      detail: "피드백 문서를 멤버가 열람할 수 있습니다.",
      state: "DONE",
      stateLabel: "완료",
      tone: "ok",
      href: "/app/feedback/22222222-2222-2222-2222-222222222222",
      actionLabel: "확인하기",
      completedStamp: "열람 가능",
    },
    {
      id: "MEMBER_NOTIFICATION_SENT",
      label: "멤버 알림",
      detail: "멤버 알림이 발송되었습니다.",
      state: "DONE",
      stateLabel: "완료",
      tone: "ok",
      href: "/app/host/notifications",
      actionLabel: "확인하기",
      completedStamp: "발송됨",
    },
    {
      id: "PUBLIC_RECORD_VISIBLE",
      label: "공개 기록",
      detail: "공개 기록 표면에서 발행 상태를 확인할 수 있습니다.",
      state: "DONE",
      stateLabel: "완료",
      tone: "ok",
      href: "/sessions/22222222-2222-2222-2222-222222222222",
      actionLabel: "확인하기",
      completedStamp: "노출됨",
    },
  ],
  surfaces: [
    {
      id: "HOST",
      title: "호스트 문서",
      detail: "호스트가 기록 패키지와 마감 상태를 관리할 수 있습니다.",
      tone: "ok",
      href: "/app/host/sessions/22222222-2222-2222-2222-222222222222/edit",
      actionLabel: "호스트 문서 확인",
    },
    {
      id: "MEMBER",
      title: "멤버 회고",
      detail: "멤버가 지난 모임 기록과 피드백으로 돌아갈 수 있습니다.",
      tone: "ok",
      href: "/app/sessions/22222222-2222-2222-2222-222222222222",
      actionLabel: "멤버 회고 확인",
    },
    {
      id: "PUBLIC",
      title: "공개 기록",
      detail: "공개 기록 표면에서 발행 상태를 확인할 수 있습니다.",
      tone: "ok",
      href: "/sessions/22222222-2222-2222-2222-222222222222",
      actionLabel: "공개 기록 확인",
    },
  ],
  evidence: [
    { label: "공개 요약", value: "저장됨" },
    { label: "하이라이트", value: "4" },
    { label: "한줄평", value: "6" },
    { label: "피드백 문서", value: "열람 가능" },
    { label: "최근 멤버 알림", value: "발송됨" },
  ],
};

async function mountEmbeddedClosing(
  mount: (component: ReactElement) => Promise<Locator>,
  page: Page,
  view: SessionClosingBoardView,
  viewport: { width: number; height: number },
) {
  await page.setViewportSize(viewport);
  await page.emulateMedia({ colorScheme: "light" });
  const component = await mount(
    <div style={{ width: "100%" }}>
      <SessionClosingBoard view={view} embedded />
    </div>,
  );
  await expectReducedMotion(page);
  return component;
}

async function assertEmbeddedClosing(
  component: Locator,
  page: Page,
  view: SessionClosingBoardView,
) {
  await expect(component.getByRole("region", { name: "장부 마감 체크리스트" })).toBeVisible();
  await expect(component.getByText("장부 마감")).toBeVisible();
  await expect(component.getByRole("heading", { level: 1 })).toHaveCount(0);
  await expect(component.getByText("이번 모임 다음 조치")).toHaveCount(0);
  await expect(component.getByRole("region", { name: "마감 증거" })).toBeVisible();
  await expect(component.getByText("호스트 문서 / 멤버 회고 / 공개 기록")).toBeVisible();
  await expect(component.locator(".rm-host-closing-board__checklist-item")).toHaveCount(5);
  await expect(component.locator(".rm-host-closing-board__surface")).toHaveCount(view.surfaces.length);
  await expect(component.locator(".rm-host-closing-board__evidence > div")).toHaveCount(view.evidence.length);
  await expectNoHorizontalOverflow(page);

  for (const surface of view.surfaces) {
    const surfaceItem = component.locator(".rm-host-closing-board__surface").filter({ hasText: surface.title });
    await expect(surfaceItem).toHaveCount(1);
    await expect(surfaceItem.getByText(surface.detail, { exact: true })).toBeVisible();
    const destination = surfaceItem.getByRole("link", { name: surface.actionLabel });
    if (surface.href) {
      await expect(destination).toHaveAttribute("href", surface.href);
    } else {
      await expect(destination).toHaveCount(0);
    }
  }

  for (const copy of await component.locator(".rm-host-closing-board__checklist-item .small").all()) {
    const fontSize = await copy.evaluate((element) => Number.parseFloat(getComputedStyle(element).fontSize));
    expect(fontSize).toBeGreaterThanOrEqual(14);
  }
  for (const action of await component.locator(".rm-host-closing-board__checklist-item a").all()) {
    const fontSize = await action.evaluate((element) => Number.parseFloat(getComputedStyle(element).fontSize));
    expect(fontSize).toBeGreaterThanOrEqual(14);
  }
}

test("Embedded closing checklist locks blocked state at 1440", async ({ mount, page }) => {
  const component = await mountEmbeddedClosing(mount, page, blockedView, VISUAL_AUTHORITY_VIEWPORTS.desktopWide);
  await assertEmbeddedClosing(component, page, blockedView);
  await expect(component).toHaveScreenshot("host-closing-embedded-blocked-1440.png");
});

test("Embedded closing checklist locks published state at 900", async ({ mount, page }) => {
  const component = await mountEmbeddedClosing(mount, page, publishedView, VISUAL_AUTHORITY_VIEWPORTS.tablet);
  await assertEmbeddedClosing(component, page, publishedView);
  await expect(component).toHaveScreenshot("host-closing-embedded-published-900.png");
});

test("Embedded closing checklist locks blocked state at 768", async ({ mount, page }) => {
  const component = await mountEmbeddedClosing(mount, page, blockedView, VISUAL_AUTHORITY_VIEWPORTS.tabletNarrow);
  await assertEmbeddedClosing(component, page, blockedView);
  await expect(component).toHaveScreenshot("host-closing-embedded-blocked-768.png");
});

test("Embedded closing checklist locks published state at 390", async ({ mount, page }) => {
  const component = await mountEmbeddedClosing(mount, page, publishedView, VISUAL_AUTHORITY_VIEWPORTS.mobile);
  await assertEmbeddedClosing(component, page, publishedView);
  await expect(component).toHaveScreenshot("host-closing-embedded-published-390.png");
});

test("Embedded closing checklist locks blocked state at 320", async ({ mount, page }) => {
  const component = await mountEmbeddedClosing(mount, page, blockedView, VISUAL_AUTHORITY_VIEWPORTS.mobileNarrow);
  await assertEmbeddedClosing(component, page, blockedView);
  await expect(component).toHaveScreenshot("host-closing-embedded-blocked-320.png");
});

test("Embedded closing checklist stays inside the 1024 viewport matrix", async ({ mount, page }) => {
  const component = await mountEmbeddedClosing(mount, page, publishedView, VISUAL_AUTHORITY_VIEWPORTS.desktop);
  await assertEmbeddedClosing(component, page, publishedView);
  expect(await page.evaluate(() => window.innerWidth)).toBe(1024);
});
