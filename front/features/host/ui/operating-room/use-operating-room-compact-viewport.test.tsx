import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useOperatingRoomCompactViewport } from "./use-operating-room-compact-viewport";

type MediaListener = (event: MediaQueryListEvent) => void;

function stubMatchMedia(matches: boolean) {
  const listeners = new Set<MediaListener>();
  const media = {
    matches,
    media: "(max-width: 767px)",
    addEventListener: (_type: string, listener: EventListener) => {
      listeners.add(listener as MediaListener);
    },
    removeEventListener: (_type: string, listener: EventListener) => {
      listeners.delete(listener as MediaListener);
    },
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
    onchange: null,
  };
  window.matchMedia = vi.fn().mockReturnValue(media);
  return {
    setMatches(next: boolean) {
      media.matches = next;
      act(() => {
        listeners.forEach((listener) => listener({ matches: next } as MediaQueryListEvent));
      });
    },
  };
}

describe("useOperatingRoomCompactViewport", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("treats max-width 767px as the compact live viewport", () => {
    stubMatchMedia(true);
    const { result } = renderHook(() => useOperatingRoomCompactViewport());
    expect(result.current).toBe(true);
  });

  it("stays desktop when the compact media query does not match", () => {
    stubMatchMedia(false);
    const { result } = renderHook(() => useOperatingRoomCompactViewport());
    expect(result.current).toBe(false);
  });
});
