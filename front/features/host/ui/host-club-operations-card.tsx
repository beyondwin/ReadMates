import { clubAiFailureDelta, type HostClubOperationsSnapshot } from "@/shared/model/club-operations";

function formatDelta(value: number): string {
  if (value > 0) return `+${value}`;
  return String(value);
}

export function HostClubOperationsCard({ snapshot }: { snapshot: HostClubOperationsSnapshot }) {
  const aiDelta = clubAiFailureDelta(snapshot.aiUsage);
  return (
    <section className="host-club-ops" aria-label="운영 신호">
      <h2>운영 신호</h2>
      <dl className="host-club-ops__grid">
        <div>
          <dt>준비 상태</dt>
          <dd>{snapshot.readiness.state}</dd>
        </div>
        <div>
          <dt>열린 세션</dt>
          <dd>{snapshot.sessionProgress.currentOpenCount}</dd>
        </div>
        <div>
          <dt>마감 대기</dt>
          <dd>{snapshot.sessionProgress.incompleteRecordCount}</dd>
        </div>
        <div>
          <dt>AI 실패 (최근 7일)</dt>
          <dd>
            {snapshot.aiUsage.failedRecentJobs}건 <span className="host-club-ops__delta">({formatDelta(aiDelta)})</span>
          </dd>
        </div>
      </dl>
      {snapshot.readiness.blockingReasons.length > 0 ? (
        <ul className="host-club-ops__blockers">
          {snapshot.readiness.blockingReasons.map((reason) => (
            <li key={reason}>{reason}</li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
