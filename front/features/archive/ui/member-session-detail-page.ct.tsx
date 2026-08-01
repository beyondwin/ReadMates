import { expect, test } from "@playwright/experimental-ct-react";
import { archiveSessionDetailContractFixture } from "@/tests/unit/api-contract-fixtures";
import MemberSessionDetailPage from "./member-session-detail-page";

for (const viewport of [
  { name: "desktop", width: 1200, scope: ".desktop-only" },
  { name: "mobile", width: 320, scope: ".mobile-only" },
]) {
  test(`MemberSessionDetailPage scopes reading typography on ${viewport.name}`, async ({ mount, page }) => {
    await page.setViewportSize({ width: viewport.width, height: 900 });
    const component = await mount(
      <MemberSessionDetailPage session={archiveSessionDetailContractFixture} />,
    );
    const scope = component.locator(viewport.scope);
    const summary = scope.getByText("데이터로 세상을 더 정확하게 보는 태도를 이야기했습니다.");
    const question = scope.getByRole("heading", {
      name: "10가지 본능 중에서 본인에게 가장 강하게 작용한다고 느낀 것은 무엇인가요?",
    });
    const interfaceHeading = scope.getByRole("heading", { name: "함께 남긴 질문", exact: true });

    await expect(scope).toBeVisible();
    await expect(summary).not.toHaveClass(/reading-editorial/);
    await expect(question).not.toHaveClass(/reading-editorial/);
    await expect(interfaceHeading).not.toHaveClass(/reading-editorial/);

    const typography = await question.evaluate((element) => {
      const style = getComputedStyle(element);
      return {
        fontFamily: style.fontFamily,
        fontSize: Number.parseFloat(style.fontSize),
        lineHeight: Number.parseFloat(style.lineHeight),
        clientWidth: (element as HTMLElement).clientWidth,
        scrollWidth: (element as HTMLElement).scrollWidth,
      };
    });
    expect(typography.fontFamily).toContain("Pretendard");
    expect(typography.fontFamily).not.toContain("Iowan Old Style");
    expect(typography.fontSize).toBeGreaterThanOrEqual(16);
    expect(typography.lineHeight / typography.fontSize).toBeGreaterThanOrEqual(1.6);
    expect(typography.scrollWidth).toBeLessThanOrEqual(typography.clientWidth);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
}
