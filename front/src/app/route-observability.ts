import { recordFrontendRouteLoad, recordFrontendRuntimeError } from "@/shared/observability/frontend-observability";
import type { FrontendNavigationType } from "@/shared/observability/frontend-observability-contracts";

type RouteObservabilityState = {
  location: { pathname: string };
  navigation: { state: string };
  historyAction: string;
};

type RouteObservabilityRouter = {
  state: RouteObservabilityState;
  subscribe(callback: (state: RouteObservabilityState) => void): () => void;
};

function navigationTypeFromAction(action: string): FrontendNavigationType {
  if (action === "PUSH" || action === "POP" || action === "REPLACE") return action;
  return "LOAD";
}

export function attachRouteObservability(router: RouteObservabilityRouter): () => void {
  let pendingNavigation:
    | {
        pathname: string;
        navigationType: FrontendNavigationType;
        startedAt: number;
      }
    | null = null;

  return router.subscribe((state) => {
    if (state.navigation.state !== "idle") {
      pendingNavigation = {
        pathname: state.location.pathname,
        navigationType: navigationTypeFromAction(state.historyAction),
        startedAt: performance.now(),
      };
      return;
    }

    if (!pendingNavigation) return;
    recordFrontendRouteLoad({
      pathname: state.location.pathname,
      durationMs: Math.max(0, performance.now() - pendingNavigation.startedAt),
      navigationType: pendingNavigation.navigationType,
      result: "success",
    });
    pendingNavigation = null;
  });
}

function messageFromReason(reason: unknown): string | undefined {
  if (reason instanceof Error) return reason.message;
  if (typeof reason === "string") return reason;
  return undefined;
}

export function installGlobalRuntimeErrorObservers(): () => void {
  if (typeof globalThis.addEventListener !== "function" || typeof globalThis.removeEventListener !== "function") {
    return () => undefined;
  }

  const onError = (event: ErrorEvent) => {
    recordFrontendRuntimeError({
      errorKind: "unknown",
      errorCode: "WINDOW_ERROR",
      severity: "error",
      message: event.message,
    });
  };
  const onUnhandledRejection = (event: PromiseRejectionEvent) => {
    recordFrontendRuntimeError({
      errorKind: "unhandled-rejection",
      errorCode: "UNHANDLED_REJECTION",
      severity: "error",
      message: messageFromReason(event.reason),
    });
  };

  globalThis.addEventListener("error", onError as EventListener);
  globalThis.addEventListener("unhandledrejection", onUnhandledRejection as EventListener);
  return () => {
    globalThis.removeEventListener("error", onError as EventListener);
    globalThis.removeEventListener("unhandledrejection", onUnhandledRejection as EventListener);
  };
}
