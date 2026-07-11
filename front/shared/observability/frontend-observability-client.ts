import {
  type FrontendObservabilityEvent,
  sanitizeFrontendObservabilityBatch,
} from "./frontend-observability-contracts";
import { FRONTEND_OBSERVABILITY_BROWSER_PATH } from "./frontend-observability-paths";

export type FrontendObservabilityClient = {
  record(event: FrontendObservabilityEvent): void;
  flush(): Promise<void>;
  pendingCount(): number;
};

export type FrontendObservabilityClientOptions = {
  endpoint?: string;
  sendBeacon?: ((url: string, data: BodyInit) => boolean) | undefined;
  fetchImpl?: typeof fetch | undefined;
};

const DEFAULT_ENDPOINT = FRONTEND_OBSERVABILITY_BROWSER_PATH;
const MAX_QUEUE_SIZE = 60;

export function createFrontendObservabilityClient(
  options: FrontendObservabilityClientOptions = {},
): FrontendObservabilityClient {
  const endpoint = options.endpoint ?? DEFAULT_ENDPOINT;
  const queue: FrontendObservabilityEvent[] = [];
  const sendBeacon =
    options.sendBeacon ??
    (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function"
      ? (url: string, data: BodyInit) => navigator.sendBeacon(url, data)
      : undefined);
  const fetchImpl = options.fetchImpl ?? (typeof fetch === "function" ? fetch : undefined);

  function record(event: FrontendObservabilityEvent) {
    const safe = sanitizeFrontendObservabilityBatch([event]).events[0];
    if (!safe) return;
    queue.push(safe);
    if (queue.length > MAX_QUEUE_SIZE) {
      queue.splice(0, queue.length - MAX_QUEUE_SIZE);
    }
  }

  async function flush() {
    if (queue.length === 0) return;
    const batch = sanitizeFrontendObservabilityBatch(queue.splice(0, queue.length));
    if (batch.events.length === 0) return;
    const body = JSON.stringify(batch);
    const beaconBody = typeof Blob === "function" ? new Blob([body], { type: "application/json" }) : undefined;

    try {
      if (beaconBody && sendBeacon?.(endpoint, beaconBody)) return;
      if (fetchImpl) {
        await fetchImpl(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body,
          keepalive: true,
          cache: "no-store",
        });
      }
    } catch {
      // Telemetry is fail-open and must never affect product flows.
    }
  }

  return {
    record,
    flush,
    pendingCount: () => queue.length,
  };
}
