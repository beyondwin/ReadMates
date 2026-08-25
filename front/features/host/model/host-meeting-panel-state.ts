export type PanelLoadState<T> =
  | { kind: "loading" }
  | { kind: "known-empty"; data: T }
  | { kind: "unavailable"; retry: () => void }
  | { kind: "stale-cached"; data: T; observedAt: string; retry: () => void }
  | { kind: "ready"; data: T };
