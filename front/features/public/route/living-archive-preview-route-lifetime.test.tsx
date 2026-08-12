import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createMemoryRouter, type RouteObject } from "react-router";
import { RouterProvider } from "react-router/dom";
import { PageMetadataHead } from "@/shared/ui/page-metadata-head";
import { LivingArchivePreviewRouteLifetime } from "./living-archive-preview-route-lifetime";

const previewSelector = 'meta[data-readmates-living-archive-preview="true"]';

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });

  return { promise, reject, resolve };
}

function previewRoutes(preview: RouteObject, additionalRoutes: RouteObject[] = []): RouteObject[] {
  return [
    { path: "/", element: <h1>기존 공개 홈</h1> },
    ...additionalRoutes,
    {
      path: "/living-archive-preview",
      caseSensitive: true,
      errorElement: <p>프리뷰 오류</p>,
      ...preview,
    },
    { path: "*", element: <h1>공개 경로 없음</h1> },
  ];
}

function renderPreviewRouter(
  preview: RouteObject,
  additionalRoutes: RouteObject[] = [],
  initialEntry = "/living-archive-preview",
) {
  const router = createMemoryRouter(previewRoutes(preview, additionalRoutes), {
    initialEntries: [initialEntry],
  });
  render(
    <>
      <LivingArchivePreviewRouteLifetime router={router} />
      <RouterProvider router={router} />
    </>,
  );
  return router;
}

afterEach(() => {
  cleanup();
  document.head.querySelectorAll(previewSelector).forEach((node) => node.remove());
  document.head.querySelectorAll("[data-readmates-page-head]").forEach((node) => node.remove());
  document.title = "";
});

describe("LivingArchivePreviewRouteLifetime", () => {
  it("owns noindex while the initial preview loader is pending", async () => {
    const pending = deferred<null>();
    const router = renderPreviewRouter({
      loader: () => pending.promise,
      Component: () => <p>프리뷰 준비 완료</p>,
    });

    expect(document.head.querySelector(previewSelector)).toHaveAttribute("content", "noindex,nofollow");
    expect(router.state.initialized).toBe(false);

    await act(async () => pending.resolve(null));
    expect(await screen.findByText("프리뷰 준비 완료")).toBeVisible();
  });

  it("keeps noindex through a loader failure", async () => {
    renderPreviewRouter({
      loader: () => {
        throw new Error("loader failed");
      },
      Component: () => <p>도달하면 안 되는 프리뷰</p>,
    });

    expect(await screen.findByText("프리뷰 오류")).toBeVisible();
    expect(document.head.querySelector(previewSelector)).toHaveAttribute("content", "noindex,nofollow");
  });

  it("keeps noindex through a lazy-module failure", async () => {
    const lazyAttempt = vi.fn();
    renderPreviewRouter({
      lazy: async () => {
        lazyAttempt();
        throw new Error("lazy failed");
      },
    });

    await waitFor(() => expect(lazyAttempt).toHaveBeenCalledOnce());
    expect(document.head.querySelector(previewSelector)).toHaveAttribute("content", "noindex,nofollow");
  });

  it("does not claim a mixed-case preview URL while the lowercase preview loader would be pending", async () => {
    const pending = deferred<null>();
    const loader = vi.fn(() => pending.promise);
    const router = renderPreviewRouter(
      { loader, Component: () => <p>도달하면 안 되는 프리뷰</p> },
      [],
      "/LIVING-ARCHIVE-PREVIEW",
    );

    await waitFor(() => expect(router.state.initialized).toBe(true));
    expect(screen.getByRole("heading", { name: "공개 경로 없음" })).toBeVisible();
    expect(loader).not.toHaveBeenCalled();
    expect(screen.queryByText("도달하면 안 되는 프리뷰")).not.toBeInTheDocument();
    expect(document.head.querySelector(previewSelector)).toBeNull();
  });

  it("does not render the preview error boundary or metadata for a mixed-case preview URL", async () => {
    const loader = vi.fn(() => {
      throw new Error("mixed-case preview loader must not run");
    });
    renderPreviewRouter(
      { loader, Component: () => <p>도달하면 안 되는 프리뷰</p> },
      [],
      "/LIVING-ARCHIVE-PREVIEW",
    );

    expect(await screen.findByRole("heading", { name: "공개 경로 없음" })).toBeVisible();
    expect(loader).not.toHaveBeenCalled();
    expect(screen.queryByText("프리뷰 오류")).not.toBeInTheDocument();
    expect(document.head.querySelector(previewSelector)).toBeNull();
  });

  it("restores prior metadata after a successful CTA exit to an app route", async () => {
    const unrelated = document.createElement("meta");
    unrelated.name = "robots";
    unrelated.content = "index,follow";
    document.head.append(unrelated);
    const priorDescription = document.createElement("meta");
    priorDescription.name = "description";
    priorDescription.content = "앱 진입 전 설명";
    priorDescription.dataset.readmatesPageHead = "description";
    document.head.append(priorDescription);
    document.title = "앱 진입 전 제목 | ReadMates";
    const router = renderPreviewRouter(
      { Component: () => <p>프리뷰 준비 완료</p> },
      [{ path: "/clubs/reading-sai/app", element: <h1>멤버 앱 둘러보기</h1> }],
    );

    expect(await screen.findByText("프리뷰 준비 완료")).toBeVisible();
    expect(document.head.querySelector(previewSelector)).toHaveAttribute("content", "noindex,nofollow");
    expect(document.title).toBe("Living Archive Preview | ReadMates");

    await act(async () => {
      await router.navigate("/clubs/reading-sai/app");
    });

    expect(await screen.findByRole("heading", { name: "멤버 앱 둘러보기" })).toBeVisible();
    await waitFor(() => expect(document.head.querySelector(previewSelector)).toBeNull());
    expect(document.title).toBe("앱 진입 전 제목 | ReadMates");
    expect(priorDescription).toHaveAttribute("content", "앱 진입 전 설명");
    expect(document.head.querySelector('meta[name="robots"][content="index,follow"]')).toBe(unrelated);
    unrelated.remove();
  });

  it("keeps preview metadata when a pending exit is cancelled back to the preview", async () => {
    const pendingExit = deferred<null>();
    const router = renderPreviewRouter(
      { Component: () => <p>프리뷰 준비 완료</p> },
      [{ path: "/slow-exit", loader: () => pendingExit.promise, element: <h1>느린 목적지</h1> }],
    );
    expect(await screen.findByText("프리뷰 준비 완료")).toBeVisible();

    const exitNavigation = router.navigate("/slow-exit");
    await waitFor(() => expect(router.state.navigation.location?.pathname).toBe("/slow-exit"));
    expect(document.head.querySelector(previewSelector)).toHaveAttribute("content", "noindex,nofollow");
    expect(document.title).toBe("Living Archive Preview | ReadMates");

    await act(async () => {
      await router.navigate("/living-archive-preview");
    });
    pendingExit.resolve(null);
    await exitNavigation;

    expect(router.state.location.pathname).toBe("/living-archive-preview");
    expect(document.head.querySelector(previewSelector)).toHaveAttribute("content", "noindex,nofollow");
    expect(document.title).toBe("Living Archive Preview | ReadMates");
  });

  it("does not overwrite metadata installed by the destination route", async () => {
    const router = renderPreviewRouter(
      { Component: () => <p>프리뷰 준비 완료</p> },
      [{
        path: "/destination",
        element: (
          <>
            <PageMetadataHead metadata={{ title: "목적지 | ReadMates", description: "목적지 설명" }} />
            <h1>목적지 화면</h1>
          </>
        ),
      }],
    );
    expect(await screen.findByText("프리뷰 준비 완료")).toBeVisible();

    await act(async () => {
      await router.navigate("/destination");
    });

    expect(await screen.findByRole("heading", { name: "목적지 화면" })).toBeVisible();
    await waitFor(() => expect(document.title).toBe("목적지 | ReadMates"));
    expect(document.head.querySelector<HTMLMetaElement>('meta[name="description"][data-readmates-page-head]')?.content)
      .toBe("목적지 설명");
    expect(document.head.querySelector(previewSelector)).toBeNull();
  });

  it("does not change an ordinary public URL's robots policy", async () => {
    const router = createMemoryRouter(previewRoutes({ Component: () => <p>프리뷰 준비 완료</p> }), {
      initialEntries: ["/"],
    });
    render(
      <>
        <LivingArchivePreviewRouteLifetime router={router} />
        <RouterProvider router={router} />
      </>,
    );

    expect(await screen.findByRole("heading", { name: "기존 공개 홈" })).toBeVisible();
    expect(document.head.querySelector(previewSelector)).toBeNull();
  });
});
