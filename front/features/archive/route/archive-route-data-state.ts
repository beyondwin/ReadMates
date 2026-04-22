import { useEffect, useRef, useState } from "react";

const READMATES_ROUTE_REFRESH_EVENT = "readmates:route-refresh";

export type ArchiveRouteDataState<T> =
  | { status: "loading" }
  | { status: "ready"; data: T }
  | { status: "error"; error: Error };

export function useArchiveRouteData<T>(load: () => Promise<T>): ArchiveRouteDataState<T> {
  const [state, setState] = useState<ArchiveRouteDataState<T>>({ status: "loading" });
  const requestVersionRef = useRef(0);

  useEffect(() => {
    let cancelled = false;

    async function run({ preserveReadyData }: { preserveReadyData: boolean }) {
      const requestVersion = requestVersionRef.current + 1;
      requestVersionRef.current = requestVersion;
      setState((current) => (preserveReadyData && current.status === "ready" ? current : { status: "loading" }));

      try {
        const data = await load();
        if (!cancelled && requestVersion === requestVersionRef.current) {
          setState({ status: "ready", data });
        }
      } catch (error) {
        if (!cancelled && requestVersion === requestVersionRef.current) {
          setState((current) =>
            preserveReadyData && current.status === "ready"
              ? current
              : { status: "error", error: error instanceof Error ? error : new Error("ReadMates page load failed") },
          );
        }
      }
    }

    const refresh = () => {
      void run({ preserveReadyData: true });
    };

    void run({ preserveReadyData: false });
    window.addEventListener(READMATES_ROUTE_REFRESH_EVENT, refresh);

    return () => {
      cancelled = true;
      window.removeEventListener(READMATES_ROUTE_REFRESH_EVENT, refresh);
    };
  }, [load]);

  return state;
}
