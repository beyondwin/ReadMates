import { afterEach, describe, expect, it, vi } from "vitest";
import {
  rememberReadmatesListScroll,
  resetReadmatesNavigationScroll,
  restoreReadmatesListScroll,
} from "@/src/app/route-continuity";

const ARCHIVE_SCROLL_KEY = "readmates:archive-scroll";
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
  vi.restoreAllMocks();
  window.sessionStorage.clear();
  window.history.pushState({}, "", "/");
  setScrollY(0);
});

describe("route continuity", () => {
  it("does not persist list scroll snapshots for link navigation", () => {
    setScrollY(480);
    window.sessionStorage.setItem(ARCHIVE_SCROLL_KEY, "stale");
    window.sessionStorage.setItem(PUBLIC_RECORDS_SCROLL_KEY, "stale");

    rememberReadmatesListScroll("/records", "?page=2", "/sessions/session-1");

    expect(window.sessionStorage.getItem(ARCHIVE_SCROLL_KEY)).toBeNull();
    expect(window.sessionStorage.getItem(PUBLIC_RECORDS_SCROLL_KEY)).toBeNull();
  });

  it("clears stale list snapshots without restoring their scroll position", () => {
    const scrollTo = setScrollToMock();
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

    expect(scrollTo).not.toHaveBeenCalled();
    expect(window.sessionStorage.getItem(PUBLIC_RECORDS_SCROLL_KEY)).toBeNull();
  });

  it("resets navigation scroll state and moves the viewport to the top", () => {
    const scrollTo = setScrollToMock();
    window.sessionStorage.setItem(ARCHIVE_SCROLL_KEY, "stale");
    window.sessionStorage.setItem(PUBLIC_RECORDS_SCROLL_KEY, "stale");

    resetReadmatesNavigationScroll();

    expect(window.sessionStorage.getItem(ARCHIVE_SCROLL_KEY)).toBeNull();
    expect(window.sessionStorage.getItem(PUBLIC_RECORDS_SCROLL_KEY)).toBeNull();
    expect(scrollTo).toHaveBeenCalledWith({ top: 0, behavior: "auto" });
  });
});
