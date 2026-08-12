import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { LivingArchivePreviewHead } from "./living-archive-preview-head";

const previewSelector = 'meta[data-readmates-living-archive-preview="true"]';

afterEach(() => {
  cleanup();
  document.head.querySelectorAll(previewSelector).forEach((node) => node.remove());
  document.head.querySelectorAll("[data-readmates-page-head]").forEach((node) => node.remove());
  document.title = "";
});

describe("LivingArchivePreviewHead", () => {
  it("installs preview metadata and one managed noindex robots element", () => {
    render(<LivingArchivePreviewHead />);

    expect(document.title).toBe("Living Archive Preview | ReadMates");
    expect(document.head.querySelector('meta[name="description"]')?.getAttribute("content")).toBe(
      "읽는사이의 공개 기록을 Living Archive 시안으로 미리 봅니다.",
    );
    expect(document.head.querySelector(previewSelector)).toMatchObject({
      name: "robots",
      content: "noindex,nofollow",
    });
  });

  it("reuses its managed robots element on rerender and removes only that element on unmount", () => {
    const unrelated = document.createElement("meta");
    unrelated.name = "robots";
    unrelated.content = "index,follow";
    document.head.append(unrelated);
    const { rerender, unmount } = render(<LivingArchivePreviewHead />);
    const managed = document.head.querySelector(previewSelector);

    rerender(<LivingArchivePreviewHead />);

    expect(document.head.querySelectorAll(previewSelector)).toHaveLength(1);
    expect(document.head.querySelector(previewSelector)).toBe(managed);

    unmount();

    expect(document.head.querySelector(previewSelector)).toBeNull();
    expect(document.head.querySelector('meta[name="robots"][content="index,follow"]')).toBe(unrelated);
    unrelated.remove();
  });
});
