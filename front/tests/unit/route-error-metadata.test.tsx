import { cleanup, render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";
import { NotFoundRoute } from "@/src/app/route-error";

afterEach(() => {
  cleanup();
  document.head.querySelectorAll("[data-readmates-page-head]").forEach((node) => node.remove());
  document.title = "";
});

describe("route error metadata", () => {
  it("sets public not-found metadata for Lighthouse and browser tabs", () => {
    render(
      <MemoryRouter>
        <NotFoundRoute variant="public" />
      </MemoryRouter>,
    );

    expect(document.title).toBe("페이지를 찾을 수 없습니다 | ReadMates");
    expect(document.head.querySelector('meta[name="description"]')?.getAttribute("content")).toBe(
      "요청한 ReadMates 공개 페이지를 찾을 수 없습니다. 공개 홈에서 클럽 소개와 기록을 다시 확인해 주세요.",
    );
  });
});
