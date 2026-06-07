import { clubAiFailureDelta, type HostClubOperationsSnapshot } from "@/shared/model/club-operations";

type ReadinessTone = "ok" | "warn" | "neutral";

type OperatingMetric = {
  helper: string;
  label: string;
  value: string;
};

function formatDelta(value: number): string {
  if (value > 0) return `+${value}`;
  return String(value);
}

function nonNegative(value: number): number {
  return Math.max(0, value);
}

function readinessTone(state: string, blockers: string[]): ReadinessTone {
  if (blockers.length > 0) return "warn";
  if (state === "READY") return "ok";
  return "neutral";
}

function operatingSummary(snapshot: HostClubOperationsSnapshot): string {
  const aiDelta = clubAiFailureDelta(snapshot.aiUsage);

  if (snapshot.readiness.blockingReasons.length > 0) {
    return "운영 준비를 막는 항목이 있습니다. 먼저 차단 사유를 확인하세요.";
  }

  if (snapshot.sessionProgress.incompleteRecordCount > 0) {
    return "마감 대기 중인 세션 기록이 있습니다. 공개 전 기록 완성을 먼저 확인하세요.";
  }

  if (snapshot.aiUsage.failedRecentJobs > 0 || aiDelta > 0) {
    return "최근 AI 실패가 늘었습니다. 알림 장부와 세션 준비 상태를 함께 확인하세요.";
  }

  if (snapshot.readiness.state === "READY") {
    return "현재 막힌 항목은 없습니다. 열린 세션을 기준으로 운영을 이어갈 수 있습니다.";
  }

  return "운영 상태 확인이 필요합니다. 세션 문서와 알림 장부를 함께 점검하세요.";
}

function operatingMetrics(snapshot: HostClubOperationsSnapshot): OperatingMetric[] {
  const aiDelta = clubAiFailureDelta(snapshot.aiUsage);

  return [
    {
      label: "열린 세션",
      value: String(nonNegative(snapshot.sessionProgress.currentOpenCount)),
      helper: "현재 진행 중",
    },
    {
      label: "마감 대기",
      value: String(nonNegative(snapshot.sessionProgress.incompleteRecordCount)),
      helper: "기록 완성 필요",
    },
    {
      label: "AI 실패",
      value: `${nonNegative(snapshot.aiUsage.failedRecentJobs)}건`,
      helper: "최근 7일",
    },
    {
      label: "전주 대비",
      value: formatDelta(aiDelta),
      helper: "AI 실패 변화",
    },
  ];
}

export function HostClubOperationsCard({ snapshot }: { snapshot: HostClubOperationsSnapshot }) {
  const tone = readinessTone(snapshot.readiness.state, snapshot.readiness.blockingReasons);
  const metrics = operatingMetrics(snapshot);

  return (
    <section className="host-club-ops" aria-label="운영 신호">
      <div className="host-club-ops__header">
        <h2>운영 신호</h2>
        <span className={`host-club-ops__badge host-club-ops__badge--${tone}`}>{snapshot.readiness.state}</span>
      </div>

      <p className="host-club-ops__summary">{operatingSummary(snapshot)}</p>

      <dl className="host-club-ops__grid">
        {metrics.map((metric) => (
          <div key={metric.label} className="host-club-ops__metric">
            <dt>{metric.label}</dt>
            <dd>{metric.value}</dd>
            <span>{metric.helper}</span>
          </div>
        ))}
      </dl>

      {snapshot.readiness.blockingReasons.length > 0 ? (
        <ul className="host-club-ops__blockers" aria-label="차단 사유">
          {snapshot.readiness.blockingReasons.map((reason) => (
            <li key={reason}>{reason}</li>
          ))}
        </ul>
      ) : null}

      <div className="host-club-ops__actions" aria-label="운영 신호 조치">
        <a className="btn btn-quiet btn-sm" href="/app/host/sessions/new">
          세션 문서 열기
        </a>
        <a className="btn btn-ghost btn-sm" href="/app/host/notifications">
          알림 장부 보기
        </a>
      </div>
    </section>
  );
}
