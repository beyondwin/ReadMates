import { expect, test } from "@playwright/experimental-ct-react";
import type { LivingArchivePreviewModel } from "@/features/public/model/living-archive-preview-model";
import { LivingArchivePreviewPage } from "./living-archive-preview-page";

const sessions = Array.from({ length: 6 }, (_, index) => {
  const sessionNumber = 6 - index;

  return {
    sessionId: `session-${sessionNumber}`,
    sessionNumber,
    bookTitle: `${sessionNumber}번째 공개 책 기록과 Expansive Archive Volume ${sessionNumber}`,
    bookAuthor: `공개 저자 ${sessionNumber}`,
    bookImageUrl: null,
    date: `2026-0${8 - index}-03`,
    summary: "공개된 대화와 deliberately expansive English reflection이 작은 화면에서도 온전히 이어지는 기록입니다.",
    highlightCount: 2,
    oneLinerCount: 2,
  };
});

const model: LivingArchivePreviewModel = {
  clubName: "읽는사이",
  sessions,
  latest: sessions[0],
  latestDetail: {
    ...sessions[0],
    oneLiners: [
      { authorName: "민지", authorShortName: "민", avatarKey: "minji", text: "오늘 나눈 대화와 an enduring English reflection이 책 안에서 오래 자라날 것 같아요." },
      { authorName: "준호", authorShortName: "준", avatarKey: "junho", text: "서로 다른 해석과 expansive archival language가 다음 문장을 열어 주었습니다." },
    ],
    highlights: [
      { text: "함께 읽은 문장과 a continuing reader trace가 다음 만남까지 이어집니다.", sortOrder: 1, authorName: "서연", authorShortName: "서", avatarKey: "seoyeon" },
    ],
  },
  readerTraces: [
    { id: "one-liner-0", index: 0, authorName: "민지", authorShortName: "민", avatarKey: "minji", text: "오늘 나눈 대화와 an enduring English reflection이 책 안에서 오래 자라날 것 같아요.", kind: "oneLiner" },
    { id: "one-liner-1", index: 1, authorName: "준호", authorShortName: "준", avatarKey: "junho", text: "서로 다른 해석과 expansive archival language가 다음 문장을 열어 주었습니다.", kind: "oneLiner" },
    { id: "highlight-0", index: 2, authorName: "서연", authorShortName: "서", avatarKey: "seoyeon", text: "함께 읽은 문장과 a continuing reader trace가 다음 만남까지 이어집니다.", kind: "highlight" },
  ],
};

function seconds(value: string) {
  const amount = Number.parseFloat(value);
  return value.endsWith("ms") ? amount / 1000 : amount;
}

async function mountPreview(mount: Parameters<Parameters<typeof test>[1]>[0]["mount"]) {
  return mount(
    <div style={{ position: "absolute", inset: 0 }}>
      <LivingArchivePreviewPage model={model} publicBasePath="/clubs/reading-sai" />
    </div>,
  );
}

test("preserves the approved desktop composition at 1487 by 1058", async ({ mount, page }, testInfo) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 1487, height: 1058 });
  const component = await mountPreview(mount);

  const geometry = await component.evaluate((root) => {
    const rect = (selector: string) => {
      const bounds = root.querySelector<HTMLElement>(selector)!.getBoundingClientRect();
      return {
        top: bounds.top,
        bottom: bounds.bottom,
        left: bounds.left,
        right: bounds.right,
        width: bounds.width,
        height: bounds.height,
      };
    };

    return {
      preview: rect(".living-archive-preview"),
      header: rect(".living-archive-preview__header"),
      statement: rect(".living-archive-preview__statement"),
      shelf: rect(".lap-shelf"),
      featured: rect(".lap-shelf__featured"),
      next: rect(".lap-next-slot"),
      strip: rect(".lap-editorial-strip"),
    };
  });

  expect(Math.abs((geometry.header.bottom - geometry.preview.top) / 1058 - 0.09)).toBeLessThanOrEqual(8 / 1058);
  expect(Math.abs((geometry.statement.left - geometry.preview.left) / 1487 - 0.04)).toBeLessThanOrEqual(16 / 1487);
  expect(Math.abs((geometry.statement.top - geometry.preview.top) / 1058 - 0.11)).toBeLessThanOrEqual(16 / 1058);
  expect(Math.abs((geometry.shelf.top - geometry.preview.top) / 1058 - 0.368)).toBeLessThanOrEqual(16 / 1058);
  expect(Math.abs((geometry.shelf.bottom - geometry.preview.top) / 1058 - 0.732)).toBeLessThanOrEqual(16 / 1058);
  expect(Math.abs((geometry.featured.left - geometry.preview.left + geometry.featured.width / 2) / 1487 - 0.56)).toBeLessThanOrEqual(16 / 1487);
  expect(Math.abs((geometry.next.left - geometry.preview.left + geometry.next.width / 2) / 1487 - 0.82)).toBeLessThanOrEqual(16 / 1487);
  expect(Math.abs((geometry.strip.top - geometry.preview.top) / 1058 - 0.778)).toBeLessThanOrEqual(16 / 1058);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(1487);

  await page.screenshot({ path: testInfo.outputPath("living-archive-desktop.png"), fullPage: true });
});

for (const viewport of [
  { name: "tablet", width: 768, height: 900 },
  { name: "mobile", width: 320, height: 720 },
] as const) {
  test(`reflows as an accessible document on ${viewport.name}`, async ({ mount, page }, testInfo) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    const component = await mountPreview(mount);

    const flow = await component.evaluate((root) => {
      const rect = (selector: string) => {
        const bounds = root.querySelector<HTMLElement>(selector)!.getBoundingClientRect();
        return { top: bounds.top, bottom: bounds.bottom, left: bounds.left, right: bounds.right };
      };
      const history = root.querySelector<HTMLElement>(".lap-shelf__history")!;
      const historyRows = Array.from(history.querySelectorAll<HTMLElement>(".lap-spine")).map((row) => {
        const bounds = row.getBoundingClientRect();
        return { top: bounds.top, bottom: bounds.bottom, left: bounds.left, right: bounds.right };
      });

      return {
        root: rect(".living-archive-preview"),
        header: rect(".living-archive-preview__header"),
        statement: rect(".living-archive-preview__statement"),
        shelf: rect(".lap-shelf"),
        featured: rect(".lap-shelf__featured"),
        featuredCover: rect(".lap-featured-volume__cover"),
        featuredPage: rect(".lap-featured-volume__page"),
        history: rect(".lap-shelf__history"),
        next: rect(".lap-next-slot"),
        strip: rect(".lap-editorial-strip"),
        shelfPosition: getComputedStyle(root.querySelector<HTMLElement>(".lap-shelf")!).position,
        historyDisplay: getComputedStyle(history).display,
        historyRows,
      };
    });

    for (const [name, bounds] of Object.entries(flow).filter(([, value]) => typeof value === "object" && !Array.isArray(value))) {
      const box = bounds as { left: number; right: number };
      expect(box.left, `${name} left edge`).toBeGreaterThanOrEqual(-1);
      expect(box.right, `${name} right edge`).toBeLessThanOrEqual(viewport.width + 1);
    }
    expect(flow.shelfPosition).not.toBe("absolute");
    expect(flow.historyDisplay).toBe("grid");
    expect(flow.featured.top).toBeGreaterThanOrEqual(flow.statement.bottom - 1);
    expect(Math.abs(flow.featuredCover.bottom - flow.featuredPage.bottom)).toBeLessThanOrEqual(1);
    expect(flow.history.top).toBeGreaterThanOrEqual(flow.featured.bottom - 1);
    expect(flow.next.top).toBeGreaterThanOrEqual(flow.history.bottom - 1);
    expect(flow.strip.top).toBeGreaterThanOrEqual(flow.next.bottom - 1);
    expect(flow.historyRows.every((row, index, rows) => index === 0 || row.top >= rows[index - 1]!.bottom - 1)).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewport.width);

    const linkMetrics = await component.getByRole("link").evaluateAll((links) =>
      links.map((link) => {
        const bounds = link.getBoundingClientRect();
        return { label: link.getAttribute("aria-label") ?? link.textContent?.trim(), width: bounds.width, height: bounds.height };
      }),
    );
    expect(linkMetrics.every(({ width, height }) => width >= 44 && height >= 44), JSON.stringify(linkMetrics)).toBe(true);

    await page.screenshot({ path: testInfo.outputPath(`living-archive-${viewport.name}.png`), fullPage: true });

    if (viewport.name === "mobile") {
      const shelfLinkOrder = await component.locator(".lap-shelf").getByRole("link").evaluateAll((links) =>
        links.map((link) => link.getAttribute("aria-label")),
      );
      expect(shelfLinkOrder[0]).toMatch(/^최근 대화 펼치기:/);
      expect(shelfLinkOrder.slice(1).every((label) => label?.startsWith("공개 기록 "))).toBe(true);

      await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
      await page.keyboard.press("Tab");
      await expect(component.getByRole("link", { name: "공개 기록 보기" }).first()).toBeFocused();
      await page.keyboard.press("Tab");
      await expect(component.locator(".lap-featured-volume__link")).toBeFocused();
    }

    const recordsLink = component.getByRole("link", { name: "공개 기록 보기" }).first();
    await recordsLink.focus();
    const focusStyle = await recordsLink.evaluate((element) => {
      const style = getComputedStyle(element);
      return { outlineStyle: style.outlineStyle, outlineWidth: Number.parseFloat(style.outlineWidth) };
    });
    expect(focusStyle.outlineStyle).not.toBe("none");
    expect(focusStyle.outlineWidth).toBeGreaterThanOrEqual(2);
  });
}

test("reflows without horizontal scroll at 200 percent zoom", async ({ mount, page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 640, height: 900 });
  const component = await mountPreview(mount);
  await page.evaluate(() => {
    document.documentElement.style.zoom = "2";
  });

  const metrics = await component.evaluate((root) => {
    const bounds = root.getBoundingClientRect();
    const visibleDescendants = Array.from(root.querySelectorAll<HTMLElement>("*")).filter((element) => {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
    });
    return {
      left: bounds.left,
      right: bounds.right,
      rootScrollWidth: root.scrollWidth,
      rootClientWidth: root.clientWidth,
      shelfPosition: getComputedStyle(root.querySelector<HTMLElement>(".lap-shelf")!).position,
      sectionFits: Array.from(root.querySelectorAll<HTMLElement>("header, section")).every((section) => {
        const rect = section.getBoundingClientRect();
        return rect.left >= -1 && rect.right <= window.innerWidth + 1;
      }),
      descendantBoundsFit: visibleDescendants.every((element) => {
        const rect = element.getBoundingClientRect();
        return rect.left >= -1 && rect.right <= window.innerWidth + 1;
      }),
      overflowingDescendants: visibleDescendants
        .filter((element) => element.scrollWidth > element.clientWidth + 1)
        .map((element) => ({
          className: element.className,
          clientWidth: element.clientWidth,
          scrollWidth: element.scrollWidth,
          tagName: element.tagName,
          text: element.textContent?.trim().slice(0, 80),
        })),
      clippedTextDescendants: visibleDescendants
        .filter((element) => {
          const ownsText = Array.from(element.childNodes).some((node) => node.nodeType === Node.TEXT_NODE && node.textContent?.trim());
          const style = getComputedStyle(element);
          const clipsX = style.overflowX === "hidden" || style.overflowX === "clip";
          const clipsY = style.overflowY === "hidden" || style.overflowY === "clip";
          return ownsText && ((clipsX && element.scrollWidth > element.clientWidth + 1) || (clipsY && element.scrollHeight > element.clientHeight + 1));
        })
        .map((element) => ({
          className: element.className,
          clientHeight: element.clientHeight,
          scrollHeight: element.scrollHeight,
          tagName: element.tagName,
          text: element.textContent?.trim().slice(0, 80),
        })),
    };
  });

  expect(metrics.left).toBeGreaterThanOrEqual(-1);
  expect(metrics.right).toBeLessThanOrEqual(640);
  expect(metrics.rootScrollWidth).toBeLessThanOrEqual(metrics.rootClientWidth);
  expect(metrics.shelfPosition).not.toBe("absolute");
  expect(metrics.sectionFits).toBe(true);
  expect(metrics.descendantBoundsFit).toBe(true);
  expect(
    { clipped: metrics.clippedTextDescendants, overflowing: metrics.overflowingDescendants },
    JSON.stringify({ clipped: metrics.clippedTextDescendants, overflowing: metrics.overflowingDescendants }),
  ).toEqual({ clipped: [], overflowing: [] });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(640);

  const zoomedLinks = await component.getByRole("link").evaluateAll((links) =>
    links.map((link) => {
      const rect = link.getBoundingClientRect();
      return { width: rect.width, height: rect.height };
    }),
  );
  expect(zoomedLinks.every(({ width, height }) => width >= 44 && height >= 44)).toBe(true);

  const zoomedRecordsLink = component.getByRole("link", { name: "공개 기록 보기" }).first();
  await zoomedRecordsLink.focus();
  const zoomedFocus = await zoomedRecordsLink.evaluate((element) => {
    const style = getComputedStyle(element);
    return { outlineStyle: style.outlineStyle, outlineWidth: Number.parseFloat(style.outlineWidth) };
  });
  expect(zoomedFocus.outlineStyle).not.toBe("none");
  expect(zoomedFocus.outlineWidth).toBeGreaterThanOrEqual(2);
});

test("uses one-time authored motion and an immediate reduced-motion fallback", async ({ mount, page }) => {
  await page.setViewportSize({ width: 1487, height: 1058 });
  const component = await mountPreview(mount);

  const motion = await component.evaluate((root) => {
    const animation = (selector: string, pseudo?: string) => {
      const style = getComputedStyle(root.querySelector<HTMLElement>(selector)!, pseudo);
      return {
        duration: style.animationDuration,
        iterations: style.animationIterationCount,
        name: style.animationName,
      };
    };

    return {
      shelf: animation(".lap-shelf"),
      featured: animation(".lap-featured-volume__link"),
      line: animation(".lap-reader-trace__line"),
      cta: animation(".lap-cta-link", "::after"),
    };
  });

  for (const [name, value] of Object.entries(motion)) {
    expect(value.name, `${name} animation`).not.toBe("none");
    expect(seconds(value.duration), `${name} duration`).toBeLessThanOrEqual(0.7);
    expect(Number.parseFloat(value.iterations), `${name} iteration count`).toBe(1);
  }
  await expect(component.getByRole("heading", { name: "책 사이에 사람이 남습니다" })).toBeVisible();

  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
  const reducedMotion = await component.evaluate((root) => {
    const read = (selector: string, pseudo?: string) => {
      const style = getComputedStyle(root.querySelector<HTMLElement>(selector)!, pseudo);
      const matrix = style.transform === "none" ? null : new DOMMatrixReadOnly(style.transform);
      return {
        animationDelay: style.animationDelay,
        animationDuration: style.animationDuration,
        animationIterations: style.animationIterationCount,
        opacity: Number.parseFloat(style.opacity),
        transform: style.transform,
        transformDeterminant: matrix ? matrix.a * matrix.d - matrix.b * matrix.c : 1,
        transitionDuration: style.transitionDuration,
      };
    };

    return {
      shelf: read(".lap-shelf"),
      featured: read(".lap-featured-volume__link"),
      cover: read(".lap-featured-volume__cover"),
      line: read(".lap-reader-trace__line"),
      cta: read(".lap-cta-link", "::after"),
    };
  });

  for (const value of Object.values(reducedMotion)) {
    expect(seconds(value.animationDelay)).toBeLessThanOrEqual(0.00001);
    expect(seconds(value.animationDuration)).toBeLessThanOrEqual(0.00001);
    expect(Number.parseFloat(value.animationIterations)).toBeLessThanOrEqual(1);
    expect(seconds(value.transitionDuration)).toBeLessThanOrEqual(0.00001);
    expect(value.opacity).toBe(1);
    expect(value.transformDeterminant).toBeGreaterThan(0.9);
  }
  expect(reducedMotion.shelf.transform).toBe("none");
  expect(reducedMotion.featured.transform).toBe("none");
});
