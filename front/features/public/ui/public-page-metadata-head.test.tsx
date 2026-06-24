import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { PublicPageMetadataHead } from "./public-page-metadata-head";

afterEach(() => {
  cleanup();
  document.head.querySelectorAll("[data-readmates-page-head]").forEach((node) => node.remove());
  document.title = "";
});

describe("PublicPageMetadataHead", () => {
  it("writes title and meta description", () => {
    render(
      <PublicPageMetadataHead
        metadata={{
          title: "읽는사이 | ReadMates",
          description: "작게 읽고 깊게 나누는 모임",
        }}
      />,
    );

    expect(document.title).toBe("읽는사이 | ReadMates");
    expect(document.head.querySelector('meta[name="description"]')?.getAttribute("content")).toBe(
      "작게 읽고 깊게 나누는 모임",
    );
  });

  it("updates the managed description without duplicating meta nodes", () => {
    const { rerender } = render(
      <PublicPageMetadataHead
        metadata={{
          title: "처음 | ReadMates",
          description: "처음 설명",
        }}
      />,
    );

    rerender(
      <PublicPageMetadataHead
        metadata={{
          title: "다음 | ReadMates",
          description: "다음 설명",
        }}
      />,
    );

    expect(document.title).toBe("다음 | ReadMates");
    expect(document.head.querySelectorAll('meta[name="description"]')).toHaveLength(1);
    expect(document.head.querySelector('meta[name="description"]')?.getAttribute("content")).toBe("다음 설명");
  });

  it("falls back to default metadata when route data is null", () => {
    render(<PublicPageMetadataHead metadata={null} />);

    expect(document.title).toBe("ReadMates");
    expect(document.head.querySelector('meta[name="description"]')?.getAttribute("content")).toBe(
      "ReadMates는 독서 모임의 공개 기록과 클럽 소개를 안전하게 보여주는 읽기 모임 서비스입니다.",
    );
  });
});
