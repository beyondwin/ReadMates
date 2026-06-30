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
    let listener: ((state: TestRouterState) => void) | null = null;
    const router = {
      state: { location: { pathname: "/app" }, navigation: { state: "idle" }, historyAction: "POP" },
      subscribe(callback: typeof listener) {
        listener = callback;
        return () => undefined;
      },
    };

    const detach = attachRouteObservability(router);
    listener?.({ location: { pathname: "/app/session/current" }, navigation: { state: "loading" }, historyAction: "PUSH" });
    listener?.({ location: { pathname: "/app/session/current" }, navigation: { state: "idle" }, historyAction: "PUSH" });
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
    let rejectionHandler: EventListener | null = null;
    vi.stubGlobal(
      "addEventListener",
      vi.fn((type: string, listener: EventListener) => {
        if (type === "unhandledrejection") {
          rejectionHandler = listener;
        }
      }),
    );
    vi.stubGlobal("removeEventListener", vi.fn());

    const remove = installGlobalRuntimeErrorObservers();

    rejectionHandler?.(promiseRejection(new Error("private token message")));
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
