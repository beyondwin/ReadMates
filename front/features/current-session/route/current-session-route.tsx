import { useEffect, useRef, useState } from "react";
import { useLoaderData } from "react-router-dom";
import CurrentSession from "@/features/current-session/components/current-session";
import { loadCurrentSessionRouteData, type CurrentSessionRouteData } from "@/features/current-session/route/current-session-data";

const READMATES_ROUTE_REFRESH_EVENT = "readmates:route-refresh";

export function CurrentSessionRoute() {
  const loaderData = useLoaderData() as CurrentSessionRouteData;
  const [routeDataState, setRouteDataState] = useState(() => ({
    loaderData,
    routeData: loaderData,
  }));
  const refreshSequence = useRef(0);

  useEffect(() => {
    const refresh = () => {
      const requestSequence = refreshSequence.current + 1;
      refreshSequence.current = requestSequence;

      void loadCurrentSessionRouteData()
        .then((nextData) => {
          if (refreshSequence.current === requestSequence) {
            setRouteDataState((currentState) => {
              if (currentState.loaderData !== loaderData) {
                return currentState;
              }

              return { ...currentState, routeData: nextData };
            });
          }
        })
        .catch(() => {
          // Keep showing the last successful loader data when a background refresh fails.
        });
    };

    window.addEventListener(READMATES_ROUTE_REFRESH_EVENT, refresh);

    return () => {
      refreshSequence.current += 1;
      window.removeEventListener(READMATES_ROUTE_REFRESH_EVENT, refresh);
    };
  }, [loaderData]);

  if (routeDataState.loaderData !== loaderData) {
    setRouteDataState({ loaderData, routeData: loaderData });
    return <CurrentSession auth={loaderData.auth} data={loaderData.current} />;
  }

  return <CurrentSession auth={routeDataState.routeData.auth} data={routeDataState.routeData.current} />;
}

export function CurrentSessionRouteError() {
  return (
    <main className="container">
      <section className="surface" style={{ margin: "48px 0", padding: 28 }}>
        <p className="eyebrow">불러오기 실패</p>
        <h1 className="h2 editorial" style={{ margin: "8px 0 0" }}>
          페이지를 불러오지 못했습니다.
        </h1>
        <p className="body" style={{ color: "var(--text-2)" }}>
          네트워크 연결 또는 계정 권한을 확인한 뒤 새로고침해 주세요. 계속 실패하면 이전 화면으로 돌아가 다시 시도해 주세요.
        </p>
      </section>
    </main>
  );
}
