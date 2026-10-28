import { afterEach, describe, expect, it, vi } from "vitest";

import * as frontendTelemetry from "@/shared/observability/frontend-observability";
import { attachRouteObservability, installGlobalRuntimeErrorObservers } from "./route-observability";

type TestRouterState = {
  location: { pathname: string };
  navigation: { state: string };
  historyAction: string;
};

function promiseRejection(reason: unknown): Event {
  const event = new Event("unhandledrejection");
  Object.defineProperty(event, "reason", { value: reason });
  return event;
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("route observability wiring", () => {
  it("records route load when router navigation returns to idle", () => {
    const recordSpy = vi.spyOn(frontendTelemetry, "recordFrontendRouteLoad").mockImplementation(() => undefined);
    const listener: { current?: (state: TestRouterState) => void } = {};
    const router = {
      state: { location: { pathname: "/app" }, navigation: { state: "idle" }, historyAction: "POP" },
      subscribe(callback: (state: TestRouterState) => void) {
        listener.current = callback;
        return () => undefined;
      },
    };

    const detach = attachRouteObservability(router);
    listener.current?.({ location: { pathname: "/app/session/current" }, navigation: { state: "loading" }, historyAction: "PUSH" });
    listener.current?.({ location: { pathname: "/app/session/current" }, navigation: { state: "idle" }, historyAction: "PUSH" });
    detach();

    expect(recordSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        pathname: "/app/session/current",
        navigationType: "PUSH",
        result: "success",
      }),
    );
  });

  it("records unhandled rejections without leaking raw stack", () => {
    const recordSpy = vi.spyOn(frontendTelemetry, "recordFrontendRuntimeError").mockImplementation(() => undefined);
    const rejectionHandler: { current?: EventListener } = {};
    vi.stubGlobal(
      "addEventListener",
      vi.fn((type: string, listener: EventListener) => {
        if (type === "unhandledrejection") {
          rejectionHandler.current = listener;
        }
      }),
    );
    vi.stubGlobal("removeEventListener", vi.fn());

    const remove = installGlobalRuntimeErrorObservers();

    rejectionHandler.current?.(promiseRejection(new Error("private token message")));
    remove();

    expect(recordSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        errorKind: "unhandled-rejection",
        errorCode: "UNHANDLED_REJECTION",
        severity: "error",
        message: "private token message",
      }),
    );
  });
});
