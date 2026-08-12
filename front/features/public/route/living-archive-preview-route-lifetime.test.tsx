import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createMemoryRouter, type RouteObject } from "react-router";
import { RouterProvider } from "react-router/dom";
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

function previewRoutes(preview: RouteObject): RouteObject[] {
  return [
    { path: "/", element: <h1>기존 공개 홈</h1> },
    {
      path: "/living-archive-preview",
      errorElement: <p>프리뷰 오류</p>,
      ...preview,
    },
  ];
}

function renderPreviewRouter(preview: RouteObject) {
  const router = createMemoryRouter(previewRoutes(preview), {
    initialEntries: ["/living-archive-preview"],
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

  it("owns successful preview metadata and removes only its node after exit", async () => {
    const unrelated = document.createElement("meta");
    unrelated.name = "robots";
    unrelated.content = "index,follow";
    document.head.append(unrelated);
    const router = renderPreviewRouter({ Component: () => <p>프리뷰 준비 완료</p> });

    expect(await screen.findByText("프리뷰 준비 완료")).toBeVisible();
    expect(document.head.querySelector(previewSelector)).toHaveAttribute("content", "noindex,nofollow");

    await act(async () => {
      await router.navigate("/");
    });

    expect(await screen.findByRole("heading", { name: "기존 공개 홈" })).toBeVisible();
    await waitFor(() => expect(document.head.querySelector(previewSelector)).toBeNull());
    expect(document.head.querySelector('meta[name="robots"][content="index,follow"]')).toBe(unrelated);
    unrelated.remove();
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
