import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, MemoryRouter } from "react-router";
import { RouterProvider } from "react-router/dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NotFoundRoute, RouteErrorBoundary, RouteErrorPage } from "@/src/app/route-error";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((promiseResolve) => {
    resolve = promiseResolve;
  });
  return { promise, resolve };
}

afterEach(() => {
  cleanup();
  document.head.querySelectorAll("[data-readmates-page-head]").forEach((node) => node.remove());
  document.title = "";
});

describe("route error metadata", () => {
  it.each([
    [401, "로그인 필요", "로그인을 다시 시작해 주세요."],
    [403, "권한 필요", "접근할 수 없습니다."],
    [404, "찾을 수 없음", "페이지를 찾을 수 없습니다."],
    [409, "상태 변경", "지금은 처리할 수 없습니다."],
    [410, "사용 종료", "더 이상 사용할 수 없는 경로입니다."],
    [429, "잠시 후 다시", "요청이 잠시 제한되었습니다."],
    [500, "서비스 오류", "요청을 마치지 못했습니다."],
    [503, "연결 지연", "서비스 연결이 원활하지 않습니다."],
  ])("renders status %i as a semantic recovery document", (status, eyebrow, heading) => {
    render(
      <MemoryRouter>
        <RouteErrorPage variant="auth" status={status} />
      </MemoryRouter>,
    );

    const main = screen.getByRole("main");
    expect(main).toHaveClass("rm-error-experience");
    expect(screen.getByText(eyebrow)).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1, name: heading })).toBeInTheDocument();
    expect(heading).not.toMatch(/\b(?:401|403|404|409|410|429|500|503)\b/);
    expect(screen.getByRole("link", { name: "로그인" })).toHaveAttribute("href", "/login");
  });

  it("exposes stable wrapping and action hooks without inline layout styles", () => {
    render(
      <MemoryRouter>
        <RouteErrorPage variant="public" status={404} />
      </MemoryRouter>,
    );

    expect(screen.getByRole("main")).toHaveClass("rm-error-experience--public");
    expect(screen.getByRole("heading", { level: 1 })).toHaveClass("rm-error-experience__title");
    expect(screen.getByRole("group", { name: "다음 단계" })).toHaveClass("rm-error-experience__actions");
    expect(screen.getByRole("link", { name: "공개 홈" })).toHaveClass("rm-error-experience__primary");
  });

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

  it.each([
    ["member", "내 클럽으로", "/app"],
    ["host", "호스트 홈", "/app/host"],
    ["auth", "로그인", "/login"],
  ] as const)(
    "keeps non-public 429 recovery copy inside the %s context",
    (variant, actionLabel, actionHref) => {
      render(
        <MemoryRouter>
          <RouteErrorPage variant={variant} status={429} />
        </MemoryRouter>,
      );

      expect(
        screen.getByText("요청이 잠시 많습니다. 잠시 기다린 뒤 다시 시도해 주세요."),
      ).toBeInTheDocument();
      expect(screen.queryByText(/공개 기록에서/)).not.toBeInTheDocument();
      expect(screen.queryByText("입력하거나 변경한 내용은 없습니다.")).not.toBeInTheDocument();
      expect(screen.getByRole("link", { name: actionLabel })).toHaveAttribute("href", actionHref);
    },
  );

  it("retries a failed public loader without leaving the scoped route", async () => {
    const user = userEvent.setup();
    const successfulLoad = deferred<{ ok: true }>();
    const loader = vi.fn(() => {
      if (loader.mock.calls.length === 1) {
        throw new Response("Too many requests", { status: 429 });
      }
      return successfulLoad.promise;
    });
    const routeUrl = "/clubs/reading-sai/records/session-1?view=full#favorite";
    const router = createMemoryRouter(
      [
        {
          path: "/clubs/:clubSlug/records/:sessionId",
          loader,
          element: <main>복구된 공개 기록</main>,
          errorElement: <RouteErrorBoundary variant="public" />,
        },
      ],
      { initialEntries: [routeUrl] },
    );
    render(<RouterProvider router={router} />);

    expect(await screen.findByText("입력하거나 변경한 내용은 없습니다.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "공개 기록으로 이동" })).toHaveAttribute(
      "href",
      "/clubs/reading-sai/records",
    );
    expect(loader).toHaveBeenCalledTimes(1);
    expect(`${router.state.location.pathname}${router.state.location.search}${router.state.location.hash}`).toBe(
      routeUrl,
    );

    await user.click(screen.getByRole("button", { name: "다시 시도" }));

    await waitFor(() => expect(loader).toHaveBeenCalledTimes(2));
    expect(screen.getByRole("button", { name: "다시 불러오는 중" })).toBeDisabled();
    expect(`${router.state.location.pathname}${router.state.location.search}${router.state.location.hash}`).toBe(
      routeUrl,
    );

    await act(async () => {
      successfulLoad.resolve({ ok: true });
      await successfulLoad.promise;
    });

    expect(await screen.findByText("복구된 공개 기록")).toBeInTheDocument();
    expect(screen.queryByText("페이지를 불러오지 못했습니다.")).not.toBeInTheDocument();
    expect(`${router.state.location.pathname}${router.state.location.search}${router.state.location.hash}`).toBe(
      routeUrl,
    );
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
