import { expect, test } from "@playwright/test";

const appOrigin = `http://localhost:${process.env.PLAYWRIGHT_PORT ?? 3100}`;
const memberReturnTo = "/clubs/reading-sai/app/sessions/current";

test("failed Google login offers explicit account selection", async ({ page }) => {
  await page.goto(
    `/login?error=membership-left&returnTo=${encodeURIComponent(memberReturnTo)}`,
  );

  await expect(page.getByRole("alert")).toContainText("이전 멤버십이 종료된 계정입니다");
  await expect(page.getByRole("link", { name: "다른 Google 계정으로 로그인" })).toHaveAttribute(
    "href",
    `/login?returnTo=${encodeURIComponent(memberReturnTo)}`,
  );
});

test("KakaoTalk browser receives copy-first recovery without horizontal overflow", async ({ browser }) => {
  const context = await browser.newContext({
    userAgent: "Mozilla/5.0 KAKAOTALK/25.7.0",
    viewport: { width: 320, height: 720 },
  });
  await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: appOrigin });
  const page = await context.newPage();
  await page.goto(
    `${appOrigin}/login?error=google&returnTo=${encodeURIComponent(memberReturnTo)}`,
  );

  const advisory = page.getByRole("complementary", { name: "외부 브라우저에서 로그인해 주세요" });
  const advisoryHeading = page.getByRole("heading", { name: "외부 브라우저에서 로그인해 주세요" });
  const copyButton = page.getByRole("button", { name: "로그인 주소 복사" });
  const googleAction = page.getByRole("link", { name: "Google 로그인 시도" });

  await expect(advisory).toBeInViewport();
  await expect(advisoryHeading).toBeInViewport();
  await expect(copyButton).toBeInViewport({ ratio: 1 });
  await expect(googleAction).toBeVisible();
  await expect(googleAction).toHaveAttribute(
    "href",
    `/login?returnTo=${encodeURIComponent(memberReturnTo)}`,
  );

  const copyElement = await copyButton.elementHandle();
  const googleElement = await googleAction.elementHandle();
  if (!copyElement || !googleElement) {
    throw new Error("Kakao login recovery actions must be attached to the document");
  }
  expect(
    await advisoryHeading.evaluate(
      (heading, copy) => Boolean(heading.compareDocumentPosition(copy) & Node.DOCUMENT_POSITION_FOLLOWING),
      copyElement,
    ),
  ).toBe(true);
  expect(
    await copyButton.evaluate(
      (copy, google) => Boolean(copy.compareDocumentPosition(google) & Node.DOCUMENT_POSITION_FOLLOWING),
      googleElement,
    ),
  ).toBe(true);

  const [headingBox, copyBox, googleBox, viewportHeight] = await Promise.all([
    advisoryHeading.boundingBox(),
    copyButton.boundingBox(),
    googleAction.boundingBox(),
    page.evaluate(() => window.innerHeight),
  ]);
  if (!headingBox || !copyBox || !googleBox) {
    throw new Error("Kakao login recovery guidance must have a rendered layout box");
  }
  expect(headingBox.y).toBeGreaterThanOrEqual(0);
  expect(headingBox.y + headingBox.height).toBeLessThanOrEqual(viewportHeight);
  expect(copyBox.y).toBeGreaterThanOrEqual(0);
  expect(copyBox.y + copyBox.height).toBeLessThanOrEqual(viewportHeight);
  expect(headingBox.y + headingBox.height).toBeLessThanOrEqual(copyBox.y);
  expect(copyBox.y + copyBox.height).toBeLessThanOrEqual(googleBox.y);

  await copyButton.focus();
  await expect(copyButton).toBeFocused();
  await copyButton.click();
  await expect(page.getByRole("status")).toContainText("로그인 주소를 복사했습니다");
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
    `${appOrigin}/login?error=google&returnTo=${encodeURIComponent(memberReturnTo)}`,
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
    ),
  ).toBe(true);

  await context.close();
});
