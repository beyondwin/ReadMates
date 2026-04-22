import { useCallback } from "react";
import type { PendingApprovalAppResponse } from "@/shared/api/readmates";
import { readmatesFetch } from "@/shared/api/readmates";
import { useReadmatesData } from "./readmates-page-data";
import { ReadmatesPageState } from "./readmates-page";

export default function PendingApprovalPage() {
  const state = useReadmatesData(
    useCallback(() => readmatesFetch<PendingApprovalAppResponse>("/api/app/pending"), []),
  );

  return (
    <ReadmatesPageState state={state}>
      {(data) => (
        <main className="app-content">
          <section className="page-header-compact">
            <div className="container">
              <p className="eyebrow">가입 승인 대기</p>
              <h1 className="h1 editorial">호스트 승인 후 모든 기능을 사용할 수 있습니다.</h1>
              <p className="body" style={{ color: "var(--text-2)" }}>
                승인 전에는 모임 정보를 읽을 수 있고, 질문 작성과 피드백 문서 열람은 제한됩니다.
              </p>
            </div>
          </section>
          {data.currentSession ? (
            <section className="container" style={{ padding: "24px 0 72px" }}>
              <p className="eyebrow">현재 모임 · {data.clubName}</p>
              <h2 className="h2 editorial">{data.currentSession.bookTitle}</h2>
              <p className="body">
                {data.currentSession.date} · {data.currentSession.locationLabel}
              </p>
            </section>
          ) : null}
        </main>
      )}
    </ReadmatesPageState>
  );
}
