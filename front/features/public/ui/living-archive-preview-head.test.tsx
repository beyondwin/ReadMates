import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { LivingArchivePreviewHead } from "./living-archive-preview-head";

const previewSelector = 'meta[data-readmates-living-archive-preview="true"]';
const previewDescriptionSelector = 'meta[data-readmates-living-archive-preview-description="true"]';

afterEach(() => {
  cleanup();
  document.head.querySelectorAll(previewSelector).forEach((node) => node.remove());
  document.head.querySelectorAll(previewDescriptionSelector).forEach((node) => node.remove());
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

  it("restores the title and managed description it replaced when preview ownership ends", () => {
    const previousDescription = document.createElement("meta");
    previousDescription.name = "description";
    previousDescription.content = "이전에 표시하던 페이지 설명";
    previousDescription.dataset.readmatesPageHead = "description";
    document.head.append(previousDescription);
    document.title = "이전 페이지 | ReadMates";
    const { unmount } = render(<LivingArchivePreviewHead />);

    expect(document.title).toBe("Living Archive Preview | ReadMates");
    expect(previousDescription).toHaveAttribute(
      "content",
      "읽는사이의 공개 기록을 Living Archive 시안으로 미리 봅니다.",
    );

    unmount();

    expect(document.title).toBe("이전 페이지 | ReadMates");
    expect(previousDescription).toHaveAttribute("content", "이전에 표시하던 페이지 설명");
    expect(previousDescription).not.toHaveAttribute("data-readmates-living-archive-preview-description");
  });

  it("removes only its description and preserves an unrelated description element", () => {
    const unrelatedDescription = document.createElement("meta");
    unrelatedDescription.name = "description";
    unrelatedDescription.content = "다른 소유자가 관리하는 설명";
    unrelatedDescription.dataset.unrelatedOwner = "true";
    document.head.append(unrelatedDescription);
    const { unmount } = render(<LivingArchivePreviewHead />);

    expect(document.head.querySelector(previewDescriptionSelector)).toHaveAttribute(
      "content",
      "읽는사이의 공개 기록을 Living Archive 시안으로 미리 봅니다.",
    );

    unmount();

    expect(document.head.querySelector(previewDescriptionSelector)).toBeNull();
    expect(document.head.querySelector('meta[data-unrelated-owner="true"]')).toBe(unrelatedDescription);
    expect(unrelatedDescription).toHaveAttribute("content", "다른 소유자가 관리하는 설명");
    unrelatedDescription.remove();
  });
});
