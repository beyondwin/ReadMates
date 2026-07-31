import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NotFoundRoute, RouteErrorPage } from "@/src/app/route-error";

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

  it("keeps host error recovery inside the scoped club workspace", () => {
    render(
      <MemoryRouter initialEntries={["/clubs/reading-sai/app/host/missing"]}>
        <RouteErrorPage variant="host" status={404} />
      </MemoryRouter>,
    );

    expect(screen.getByRole("link", { name: "호스트 홈" })).toHaveAttribute(
      "href",
      "/clubs/reading-sai/app/host",
    );
  });

  it("retries a failed public loader without leaving the scoped route", async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();

    render(
      <MemoryRouter initialEntries={["/clubs/reading-sai/missing"]}>
        <RouteErrorPage variant="public" status={500} onRetry={onRetry} />
      </MemoryRouter>,
    );

    expect(screen.getByText("입력하거나 변경한 내용은 없습니다.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "공개 기록으로 이동" })).toHaveAttribute(
      "href",
      "/clubs/reading-sai/records",
    );

    await user.click(screen.getByRole("button", { name: "다시 시도" }));

    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("disables public loader retry while revalidation is running", () => {
    render(
      <MemoryRouter>
        <RouteErrorPage
          variant="public"
          status={500}
          retryState="loading"
          onRetry={() => undefined}
        />
      </MemoryRouter>,
    );

    expect(screen.getByRole("button", { name: "다시 불러오는 중" })).toBeDisabled();
  });

  it("keeps scoped public not-found recovery destination-based while retaining public records", () => {
    render(
      <MemoryRouter initialEntries={["/clubs/reading-sai/missing"]}>
        <RouteErrorPage variant="public" status={404} onRetry={() => undefined} />
      </MemoryRouter>,
    );

    expect(screen.queryByRole("button", { name: "다시 시도" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "공개 홈" })).toHaveAttribute("href", "/");
    expect(screen.getByRole("link", { name: "공개 기록으로 이동" })).toHaveAttribute(
      "href",
      "/clubs/reading-sai/records",
    );
  });

  it.each([403, 409, 410])("keeps public records available without retry for public status %i", (status) => {
    render(
      <MemoryRouter initialEntries={["/clubs/reading-sai/missing"]}>
        <RouteErrorPage variant="public" status={status} onRetry={() => undefined} />
      </MemoryRouter>,
    );

    expect(screen.queryByRole("button", { name: "다시 시도" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "공개 기록으로 이동" })).toHaveAttribute(
      "href",
      "/clubs/reading-sai/records",
    );
  });
});
