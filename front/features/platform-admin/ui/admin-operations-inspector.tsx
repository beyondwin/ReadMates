import type { ReactNode } from "react";
import { Link } from "react-router";
import type { AdminOperationCaseView } from "@/features/platform-admin/model/platform-admin-operations-model";

type SafeHistoryEvent = {
  fromState: string | null;
  toState: string;
  action: string | null;
  reasonCode: string;
  occurredAt: string;
  caseVersion: number;
};

type Props = {
  selectedCase: AdminOperationCaseView | null;
  history: readonly SafeHistoryEvent[];
  lifecycleControls: ReactNode;
  detailLoading?: boolean;
  detailUnavailable?: boolean;
};

const HISTORY_LABELS: Record<string, string> = {
  OPERATOR_ACKNOWLEDGED: "운영자가 확인함",
  OPERATOR_SNOOZED: "운영자가 보류함",
  OPERATOR_RESOLVED: "운영자가 해결 확인함",
  SIGNAL_OPENED: "신호가 처음 감지됨",
  SIGNAL_REOPENED: "신호 재감지로 다시 열림",
  SIGNAL_CLEARED: "신호가 해소됨",
};

const SOURCE_DETAIL_LABELS: Record<string, string> = {
  CLUB_READINESS: "클럽 운영에서 확인",
  NOTIFICATION: "알림 운영에서 확인",
  AI_JOB: "AI 작업에서 확인",
  CLOSING_RISK: "마감 운영에서 확인",
};

const SOURCE_STATUS_LABELS: Record<string, string> = {
  AVAILABLE: "정상",
  PARTIAL: "일부 확인 불가",
  UNAVAILABLE: "확인 불가",
  DISABLED: "비활성",
};

const CASE_STATE_LABELS: Record<string, string> = {
  OPEN: "미확인",
  ACKNOWLEDGED: "확인됨",
  SNOOZED: "보류됨",
  RESOLVED: "해결됨",
};

const KOREAN_TIME = new Intl.DateTimeFormat("ko-KR", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Seoul",
});

export function AdminOperationsInspector({
  selectedCase,
  history,
  lifecycleControls,
  detailLoading = false,
  detailUnavailable = false,
}: Props) {
  if (!selectedCase) {
    return (
      <section className="admin-operations-inspector" aria-label="운영 케이스 상세">
        <p className="admin-operations-inspector__empty">확인할 운영 케이스를 선택하세요.</p>
      </section>
    );
  }

  const sourceStatus = SOURCE_STATUS_LABELS[selectedCase.source.status] ?? "상태 확인 필요";
  const freshness = sourceFreshnessLabel(
    selectedCase.source.status,
    sourceStatus,
    selectedCase.source.generatedAt,
    selectedCase.source.lastSuccessfulAt,
  );

  return (
    <section className="admin-operations-inspector" aria-label="운영 케이스 상세">
      <header className="admin-operations-inspector__header">
        <div className="admin-operations-inspector__state-line">
          <span>{selectedCase.severityLabel}</span>
          <span>{selectedCase.stateLabel}</span>
        </div>
        <h2 className="h2">{selectedCase.summary.title}</h2>
        <p>{selectedCase.summary.description}</p>
      </header>

      <dl className="admin-operations-inspector__facts">
        <div>
          <dt>영향 범위</dt>
          <dd>{selectedCase.impactLabel}</dd>
        </div>
        <div>
          <dt>관측 source</dt>
          <dd>{selectedCase.sourceLabel}</dd>
        </div>
        <div>
          <dt>최신성</dt>
          <dd>{freshness}</dd>
        </div>
        <div>
          <dt>최초 관측</dt>
          <dd>{selectedCase.ageLabel}</dd>
        </div>
      </dl>

      <Link className="btn btn-primary admin-operations-inspector__detail-link" to={selectedCase.detailHref}>
        {SOURCE_DETAIL_LABELS[selectedCase.sourceType] ?? "운영 상세에서 확인"}
      </Link>

      <div className="admin-operations-inspector__lifecycle" aria-label="케이스 상태 관리">
        <h3 className="h3">상태 관리</h3>
        {detailLoading ? <p role="status">최신 상태를 확인하고 있습니다.</p> : null}
        {detailUnavailable ? (
          <p role="alert">상세 이력을 불러오지 못했습니다. 목록 정보는 계속 확인할 수 있습니다.</p>
        ) : null}
        {lifecycleControls ?? (
          <p className="admin-operations-inspector__permission">
            현재 역할은 상태 변경 없이 운영 근거만 확인할 수 있습니다.
          </p>
        )}
      </div>

      <div className="admin-operations-inspector__history">
        <h3 className="h3">케이스 이력</h3>
        {history.length === 0 ? (
          <p className="admin-operations-inspector__empty">표시할 상태 변경 이력이 없습니다.</p>
        ) : (
          <ol>
            {history.map((event) => (
              <li key={`${event.caseVersion}:${event.occurredAt}`}>
                <strong>{HISTORY_LABELS[event.reasonCode] ?? "상태 변경 기록"}</strong>
                <span>
                  {CASE_STATE_LABELS[event.toState] ?? "상태 확인"} · {formatTime(event.occurredAt)}
                </span>
              </li>
            ))}
          </ol>
        )}
      </div>
    </section>
  );
}

function formatTime(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "시각 확인 필요" : KOREAN_TIME.format(date);
}

function sourceFreshnessLabel(
  status: string,
  statusLabel: string,
  generatedAt: string,
  lastSuccessfulAt: string | null,
): string {
  if (status === "AVAILABLE") return `${statusLabel} · ${formatTime(generatedAt)} 기준`;
  if (status === "PARTIAL" || status === "UNAVAILABLE") {
    return lastSuccessfulAt
      ? `${statusLabel} · 마지막 정상 ${formatTime(lastSuccessfulAt)}`
      : `${statusLabel} · 정상 확인 기록 없음`;
  }
  return statusLabel;
}
