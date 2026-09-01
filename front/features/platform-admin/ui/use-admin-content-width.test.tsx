import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useAdminContentWidth } from "./use-admin-content-width";

type ObserverCallback = (entries: ResizeObserverEntry[]) => void;

function Harness() {
  const { ref, layout, width } = useAdminContentWidth<HTMLDivElement>();
  return <div ref={ref} data-testid="surface" data-layout={layout} data-width={width} />;
}

describe("useAdminContentWidth", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("stays in safe flow until observation, switches at 960px, and disconnects on cleanup", () => {
    let callback: ObserverCallback | null = null;
    const observe = vi.fn();
    const disconnect = vi.fn();
    vi.stubGlobal("ResizeObserver", class {
      constructor(next: ObserverCallback) {
        callback = next;
      }
      observe = observe;
      disconnect = disconnect;
    });
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 1440 });

    const rendered = render(<Harness />);
    const surface = screen.getByTestId("surface");
    expect(observe).toHaveBeenCalledWith(surface);
    expect(surface).toHaveAttribute("data-layout", "flow");
    expect(surface).toHaveAttribute("data-width", "0");

    act(() => callback?.([{ target: surface, contentRect: { width: 959 } } as ResizeObserverEntry]));
    expect(surface).toHaveAttribute("data-layout", "flow");
    expect(surface).toHaveAttribute("data-width", "959");

    Object.defineProperty(window, "innerWidth", { configurable: true, value: 900 });
    act(() => callback?.([{ target: surface, contentRect: { width: 960 } } as ResizeObserverEntry]));
    expect(surface).toHaveAttribute("data-layout", "split");
    expect(surface).toHaveAttribute("data-width", "960");
    expect(disconnect).not.toHaveBeenCalled();

    rendered.unmount();
    expect(disconnect).toHaveBeenCalledTimes(1);
  });

  it("keeps the permanent safe flow fallback when ResizeObserver is unavailable", () => {
    vi.stubGlobal("ResizeObserver", undefined);
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 1440 });

    render(<Harness />);

    expect(screen.getByTestId("surface")).toHaveAttribute("data-layout", "flow");
    expect(screen.getByTestId("surface")).toHaveAttribute("data-width", "0");
  });
});
