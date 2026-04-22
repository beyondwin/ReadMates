import { useEffect, useRef, useState } from "react";
import { useLoaderData } from "react-router-dom";
import { saveCheckin } from "@/features/current-session/actions/save-checkin";
import { saveQuestions } from "@/features/current-session/actions/save-question";
import { saveLongReview, saveOneLineReview } from "@/features/current-session/actions/save-review";
import { updateRsvp } from "@/features/current-session/actions/update-rsvp";
import { CurrentSessionPage, type CurrentSessionSaveActions } from "@/features/current-session/ui/current-session-page";
import type { CurrentSessionInternalLinkProps, InternalLinkComponent } from "@/features/current-session/ui/current-session-types";
import { loadCurrentSessionRouteData, type CurrentSessionRouteData } from "@/features/current-session/route/current-session-data";

const READMATES_ROUTE_REFRESH_EVENT = "readmates:route-refresh";

function requestCurrentSessionRouteRefresh() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(READMATES_ROUTE_REFRESH_EVENT));
  }
}

function AnchorInternalLink({ href, children, ...props }: CurrentSessionInternalLinkProps) {
  return (
    <a {...props} href={href}>
      {children}
    </a>
  );
}

async function requireSuccessfulSave(responsePromise: Promise<Response>, message: string) {
  const response = await responsePromise;

  if (!response.ok) {
    throw new Error(message);
  }
}

const currentSessionSaveActions = {
  updateRsvp: (status) => requireSuccessfulSave(updateRsvp(status), "RSVP update failed"),
  saveCheckin: (readingProgress, note) =>
    requireSuccessfulSave(saveCheckin(readingProgress, note), "Checkin save failed"),
  saveQuestions: (questions) => requireSuccessfulSave(saveQuestions(questions), "Questions save failed"),
  saveLongReview: (body) => requireSuccessfulSave(saveLongReview(body), "Long review save failed"),
  saveOneLineReview: (text) => requireSuccessfulSave(saveOneLineReview(text), "One-line review save failed"),
} satisfies CurrentSessionSaveActions;

export function CurrentSessionRoute({
  internalLinkComponent = AnchorInternalLink,
}: {
  internalLinkComponent?: InternalLinkComponent;
}) {
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
    return (
      <CurrentSessionPage
        auth={loaderData.auth}
        data={loaderData.current}
        actions={currentSessionSaveActions}
        internalLinkComponent={internalLinkComponent}
        onSaveSuccess={requestCurrentSessionRouteRefresh}
      />
    );
  }

  return (
    <CurrentSessionPage
      auth={routeDataState.routeData.auth}
      data={routeDataState.routeData.current}
      actions={currentSessionSaveActions}
      internalLinkComponent={internalLinkComponent}
      onSaveSuccess={requestCurrentSessionRouteRefresh}
    />
  );
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
