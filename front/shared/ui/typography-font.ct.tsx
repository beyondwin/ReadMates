import { expect, test } from "@playwright/experimental-ct-react";

test("loads the bundled Pretendard variable face for Korean and Latin copy", async ({ mount, page }) => {
  const component = await mount(
    <p className="body" style={{ fontWeight: 650 }}>
      읽는사이 ReadMates
    </p>,
  );

  const computedFamily = await component.evaluate((element) => getComputedStyle(element).fontFamily);
  expect(computedFamily).toContain("Pretendard Variable");

  const loadedFaces = await page.evaluate(async ({ family }) => {
    const faces = await document.fonts.load(`650 16px ${family}`, "읽는사이 ReadMates");
    return faces.map((face) => ({ family: face.family, status: face.status }));
  }, { family: computedFamily });

  expect(loadedFaces.length).toBeGreaterThan(0);
  expect(loadedFaces.every((face) => face.family === "Pretendard Variable" && face.status === "loaded")).toBe(true);
});
