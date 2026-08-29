import { expect, test } from "@playwright/experimental-ct-react";
import type { Locator } from "@playwright/test";
import { MemoryRouter } from "react-router";
import { AvatarChip } from "./avatar-chip";
import { TopNav } from "./top-nav";

const fontMetrics = async (locator: Locator) =>
  locator.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      family: style.fontFamily,
      size: Number.parseFloat(style.fontSize),
      clientWidth: (element as HTMLElement).clientWidth,
      scrollWidth: (element as HTMLElement).scrollWidth,
    };
  });

test("TopNav keeps the four host areas in approved desktop order and aligned typography", async ({
  mount,
}) => {
  const navigation = await mount(
    <MemoryRouter initialEntries={["/app/host"]}>
      <TopNav
        variant="host"
      />
    </MemoryRouter>,
  );

  const links = navigation.getByRole("navigation", { name: "앱 내비게이션" }).getByRole("link");
  await expect(links).toHaveText(["운영실", "일정과 모임", "사람", "기록"]);
  const destinationLink = navigation.getByRole("link", { name: "사람", exact: true });
  const meetingLink = navigation.getByRole("link", { name: "일정과 모임", exact: true });
  const [linkTypography, meetingTypography] = await Promise.all(
    [destinationLink, meetingLink].map((locator) =>
      locator.evaluate((element) => {
        const style = getComputedStyle(element);
        return {
          fontFamily: style.fontFamily,
          fontSize: style.fontSize,
          fontWeight: style.fontWeight,
          lineHeight: style.lineHeight,
        };
      }),
    ),
  );

  expect(meetingTypography).toEqual(linkTypography);
});

test("TopNav shows the desktop avatar and preserves a long account name in its accessible label", async ({ mount, page }) => {
  const memberName = "아주 긴 한국어 이름과 An exceptionally long English member name";
  await page.setViewportSize({ width: 1280, height: 480 });
  const navigation = await mount(
    <MemoryRouter initialEntries={["/app"]}>
      <TopNav
        variant="member"
        memberName={memberName}
        accountControl={
          <button type="button" className="rm-account-menu__trigger" aria-label={`${memberName} 계정 메뉴`}>
            <span className="rm-account-menu__trigger-avatar" aria-hidden="true">
              <AvatarChip avatarKey="cloud-green-book" label="" name={memberName} sizeRole="navigation" />
            </span>
            <span className="rm-account-menu__trigger-name">{memberName}</span>
            <span className="rm-account-menu__trigger-mobile-label">계정</span>
            <span className="rm-account-menu__chevron" aria-hidden="true">▾</span>
          </button>
        }
      />
    </MemoryRouter>,
  );

  const account = navigation.getByRole("button", { name: `${memberName} 계정 메뉴` });
  await expect(account.locator(".rm-account-menu__trigger-avatar img")).toHaveAttribute(
    "src",
    "/assets/avatars/book-club/cloud-green-book.webp",
  );
  await expect(account.locator(".rm-account-menu__trigger-name")).toHaveText(memberName);
  await expect(account.locator(".rm-account-menu__trigger-name")).toHaveCSS("text-overflow", "ellipsis");
  await expect(account.locator(".rm-avatar-chip")).toHaveAttribute("data-avatar-size-role", "navigation");
  expect((await account.locator(".rm-avatar-chip").boundingBox())?.width).toBe(36);
  const accountName = account.locator(".rm-account-menu__trigger-name");
  expect((await fontMetrics(accountName)).size).toBeGreaterThanOrEqual(14);
  await expect(navigation).toHaveScreenshot("top-nav-long-account-name-1280.png", {
    maxDiffPixelRatio: 0,
  });
});

test("TopNav gives the workspace switch the approved desktop icon scale", async ({ mount, page }) => {
  await page.setViewportSize({ width: 1280, height: 480 });
  const navigation = await mount(
    <MemoryRouter initialEntries={["/app"]}>
      <TopNav
        variant="member"
        memberName="멤버1"
        workspaceAction={{ href: "/app/host", label: "호스트 화면", navigation: "push" }}
      />
    </MemoryRouter>,
  );

  const switchIcon = navigation.locator(".rm-workspace-switch svg");
  expect((await switchIcon.boundingBox())?.width).toBe(22);
  expect((await navigation.locator(".rm-workspace-switch").boundingBox())?.width).toBe(36);
  expect((await navigation.locator('.rm-avatar-chip[data-avatar-size-role="navigation"]').boundingBox())?.width).toBe(36);
});
