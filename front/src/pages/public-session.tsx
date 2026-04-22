import { useCallback } from "react";
import { useLocation, useParams } from "react-router-dom";
import PublicSession from "@/features/public/components/public-session";
import type { PublicSessionDetailResponse } from "@/shared/api/readmates";
import { readmatesFetchResponse } from "@/shared/api/readmates";
import { publicRecordsReturnTarget, readPublicReadmatesReturnTarget } from "@/src/app/route-continuity";
import { Link } from "@/src/app/router-link";
import { useReadmatesData } from "./readmates-page-data";
import { ReadmatesPageState } from "./readmates-page";

async function loadPublicSession(sessionId: string) {
  const response = await readmatesFetchResponse(`/api/public/sessions/${encodeURIComponent(sessionId)}`);

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    throw new Error(`ReadMates public session fetch failed: ${sessionId} (${response.status})`);
  }

  return response.json() as Promise<PublicSessionDetailResponse>;
}

export default function PublicSessionPage() {
  const sessionId = useParams().sessionId;
  const location = useLocation();
  const returnTarget = readPublicReadmatesReturnTarget(location.state, publicRecordsReturnTarget);
  const state = useReadmatesData(
    useCallback(() => {
      if (!sessionId) {
        return Promise.resolve(null);
      }
      return loadPublicSession(sessionId);
    }, [sessionId]),
  );

  return (
    <ReadmatesPageState state={state}>
      {(session) =>
        session ? (
          <PublicSession session={session} returnTarget={returnTarget} />
        ) : (
          <main className="container">
            <section className="surface" style={{ margin: "48px 0", padding: 28 }}>
              <p className="eyebrow">공개 기록</p>
              <h1 className="h2 editorial">공개 기록을 찾을 수 없습니다.</h1>
              <Link className="btn btn-ghost btn-sm" to={returnTarget.href}>
                {returnTarget.label}
              </Link>
            </section>
          </main>
        )
      }
    </ReadmatesPageState>
  );
}
