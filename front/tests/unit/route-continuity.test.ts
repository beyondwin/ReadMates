import { afterEach, describe, expect, it, vi } from "vitest";
import {
  rememberReadmatesListScroll,
  restoreReadmatesListScroll,
} from "@/src/app/route-continuity";

const PUBLIC_RECORDS_SCROLL_KEY = "readmates:public-records-scroll";

function setScrollY(scrollY: number) {
  Object.defineProperty(window, "scrollY", { configurable: true, value: scrollY });
}

function setScrollToMock() {
  const scrollTo = vi.fn();
  Object.defineProperty(window, "scrollTo", { configurable: true, value: scrollTo });
  return scrollTo;
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  window.sessionStorage.clear();
  window.history.pushState({}, "", "/");
  setScrollY(0);
});

describe("route continuity", () => {
  it("stores list scroll snapshots with the source pathname and search", () => {
    setScrollY(480);

    rememberReadmatesListScroll("/records", "?page=2", "/sessions/session-1");

    expect(JSON.parse(window.sessionStorage.getItem(PUBLIC_RECORDS_SCROLL_KEY) ?? "{}")).toEqual({
      pathname: "/records",
      search: "?page=2",
      scrollY: 480,
    });
  });

  it("clears stale snapshots for mismatched list routes", () => {
    const scrollTo = setScrollToMock();
    window.sessionStorage.setItem(
      PUBLIC_RECORDS_SCROLL_KEY,
      JSON.stringify({
        pathname: "/records",
        search: "?page=2",
        scrollY: 480,
      }),
    );

    restoreReadmatesListScroll("/records", "");

    expect(scrollTo).not.toHaveBeenCalled();
    expect(window.sessionStorage.getItem(PUBLIC_RECORDS_SCROLL_KEY)).toBeNull();
  });

  it("ignores delayed restore attempts after the browser route changes", () => {
    vi.useFakeTimers();
    const scrollTo = setScrollToMock();
    window.history.pushState({}, "", "/records");
    window.sessionStorage.setItem(
      PUBLIC_RECORDS_SCROLL_KEY,
      JSON.stringify({
        pathname: "/records",
        search: "",
        scrollY: 480,
      }),
    );

    const cleanup = restoreReadmatesListScroll("/records", "");
    window.history.pushState({}, "", "/about");
    vi.advanceTimersByTime(1_500);
    cleanup();

    expect(scrollTo).not.toHaveBeenCalled();
  });

  it("cancels delayed restore attempts during cleanup", () => {
    vi.useFakeTimers();
    const scrollTo = setScrollToMock();
    window.history.pushState({}, "", "/records");
    window.sessionStorage.setItem(
      PUBLIC_RECORDS_SCROLL_KEY,
      JSON.stringify({
        pathname: "/records",
        search: "",
        scrollY: 480,
      }),
    );

    const cleanup = restoreReadmatesListScroll("/records", "");
    cleanup();
    vi.advanceTimersByTime(1_500);

    expect(scrollTo).not.toHaveBeenCalled();
  });

  it("keeps the snapshot available when a development cleanup runs before restore", () => {
    vi.useFakeTimers();
    const scrollTo = setScrollToMock();
    window.history.pushState({}, "", "/records");
    window.sessionStorage.setItem(
      PUBLIC_RECORDS_SCROLL_KEY,
      JSON.stringify({
        pathname: "/records",
        search: "",
        scrollY: 480,
      }),
    );

    const firstCleanup = restoreReadmatesListScroll("/records", "");
    firstCleanup();

    restoreReadmatesListScroll("/records", "");
    vi.advanceTimersByTime(1_500);

    expect(scrollTo).toHaveBeenCalledWith({ top: 480, behavior: "auto" });
    expect(window.sessionStorage.getItem(PUBLIC_RECORDS_SCROLL_KEY)).toBeNull();
  });
});
