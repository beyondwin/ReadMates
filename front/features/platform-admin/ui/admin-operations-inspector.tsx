import { useLayoutEffect, type ReactNode } from "react";
import { commitAdminEditorialLedgerCaseDocket } from "@/shared/observability/admin-editorial-ledger-performance";
import { Link } from "react-router";
import {
  adminCaseLifecycleLanguage,
  adminHealthAvailabilityLanguage,
} from "@/features/platform-admin/model/admin-status-language";
import type { AdminOperationCaseView } from "@/features/platform-admin/model/platform-admin-operations-model";
import { AdminSafeActionDock, type AdminSafeActionState } from "./admin-action-dock";
import { AdminCaseDocket } from "./admin-case-docket";
import { AdminTargetLedgerInline } from "./admin-target-ledger-inline";
import { AdminTechnicalDisclosure } from "./admin-technical-disclosure";

type SafeHistoryEvent = {
  fromState: string | null;
  toState: string;
  action: string | null;
  reasonCode: string;
  occurredAt: string;
  caseVersion: number;
};

export type AdminCaseTraversal = {
  index: number;
  total: number;
  onPrev: (() => void) | null;
  onNext: (() => void) | null;
};

type Props = {
  selectedCase: AdminOperationCaseView | null;
  auditHref: string;
  history: readonly SafeHistoryEvent[];
  lifecycleControls: ReactNode;
  detailLoading?: boolean;
  detailUnavailable?: boolean;
  permissionDenied?: boolean;
  actionState?: AdminSafeActionState;
  actionReason?: ReactNode;
  traversal?: AdminCaseTraversal;
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
  NOTIFICATION: "배달 원장에서 확인",
  AI_JOB: "AI 작업에서 확인",
  CLOSING_RISK: "마감 운영에서 확인",
};

const KOREAN_TIME = new Intl.DateTimeFormat("ko-KR", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Seoul",
});

const LEDGER_TIME = new Intl.DateTimeFormat("ko-KR", {
  month: "numeric",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZone: "Asia/Seoul",
});

export function AdminOperationsInspector({
  selectedCase,
  auditHref,
  history,
  lifecycleControls,
  detailLoading = false,
  detailUnavailable = false,
  permissionDenied = false,
  actionState = "ready",
  actionReason,
  traversal,
}: Props) {
  useLayoutEffect(() => {
    if (selectedCase) commitAdminEditorialLedgerCaseDocket(selectedCase.id);
  }, [selectedCase]);

  if (!selectedCase) {
    return (
      <section className="admin-operations-inspector" aria-label="운영 케이스 상세">
        <p className="admin-operations-inspector__empty">확인할 운영 케이스를 선택하세요.</p>
      </section>
    );
  }

  const sourceStatus = adminHealthAvailabilityLanguage(selectedCase.source.status).primaryText;
  const freshness = sourceFreshnessLabel(
    selectedCase.source.status,
    sourceStatus,
    selectedCase.source.generatedAt,
    selectedCase.source.lastSuccessfulAt,
  );
  const authorityDenied = permissionDenied || actionState === "forbidden";

  return (
    <AdminCaseDocket
      label="운영 케이스 상세"
      nav={traversal ? <DocketNav traversal={traversal} /> : null}
      title={<span className="admin-operation-wrap">{selectedCase.summary.title}</span>}
      evidence={
        <div className="admin-operations-inspector">
          <section className="admin-operations-inspector__section">
            <h3>무슨 일인가</h3>
            <p className="admin-operation-wrap">{selectedCase.summary.description}</p>
          </section>
          <section className="admin-operations-inspector__section">
            <h3>왜 중요한가</h3>
            <p>{selectedCase.impactLabel}</p>
            <p className="admin-operations-inspector__state-line">
              <span>심각도 · {selectedCase.severityLabel}</span>
              <span>현재 상태 · {selectedCase.stateLabel}</span>
              {selectedCase.reopenCount > 0 ? <span>해결 후 재개방 {selectedCase.reopenCount}회</span> : null}
            </p>
          </section>
          <section className="admin-operations-inspector__section">
            <h3>확인한 근거</h3>
            <dl className="admin-operations-inspector__facts">
              <div>
                <dt>관측 출처</dt>
                <dd>{selectedCase.sourceLabel}</dd>
              </div>
              <div>
                <dt>관측 시각</dt>
                <dd>{freshness}</dd>
              </div>
              <div>
                <dt>감지 기준</dt>
                <dd>{detectionCriterion(selectedCase.summaryCode)}</dd>
              </div>
              <div>
                <dt>최초 관측</dt>
                <dd>{selectedCase.ageLabel}</dd>
              </div>
            </dl>
            <Link className="btn btn-secondary admin-operations-inspector__detail-link admin-operation-control--touch" to={selectedCase.detailHref}>
              {SOURCE_DETAIL_LABELS[selectedCase.sourceType] ?? "운영 상세에서 확인"}
            </Link>
            <AdminTechnicalDisclosure
              items={[
                { label: "케이스 식별자", value: selectedCase.id },
                { label: "관측 출처 식별자", value: selectedCase.sourceType },
                { label: "클럽 식별자", value: selectedCase.clubId },
              ]}
            />
          </section>
        </div>
      }
      history={
        <div className="admin-operations-inspector__history">
          <div className="sec-h">
            <h3>최근 처리 기록</h3>
          </div>
          <AdminTargetLedgerInline
            entries={targetLedgerEntries(history)}
            moreHref={auditHref}
          />
        </div>
      }
      actions={
        <div className="admin-operations-inspector__lifecycle" aria-label="케이스 상태 관리">
          <h3 className="h3">다음 행동</h3>
          {detailLoading ? <p role="status">최신 상태를 확인하고 있습니다.</p> : null}
          {detailUnavailable && !permissionDenied ? (
            <p role="alert">상세 이력을 불러오지 못했습니다. 목록 정보는 계속 확인할 수 있습니다.</p>
          ) : null}
          {authorityDenied ? (
            <p className="admin-operations-inspector__permission" role="alert">
              상태 변경 권한이 더 이상 유효하지 않습니다. 새로고침 후 권한을 확인해 주세요.
            </p>
          ) : lifecycleControls ? (
            <AdminSafeActionDock
              level="L1"
              authority="allowed"
              state={actionState}
              reason={actionReason}
              primary={lifecycleControls}
            />
          ) : (
            <p className="admin-operations-inspector__permission">
              현재 역할은 상태 변경 없이 운영 근거만 확인할 수 있습니다.
            </p>
          )}
        </div>
      }
    />
  );
}

const DETECTION_CRITERIA: Record<string, string> = {
  CLUB_SETUP_REQUIRED: "공개 필수 설정 중 누락이 있음",
  CLUB_DOMAIN_ACTION_REQUIRED: "도메인 조치가 필요한 항목이 있음",
  CLUB_READY_TO_PUBLISH: "비공개 클럽이 공개 필수 조건을 충족",
  NOTIFICATION_DELIVERY_FAILURE: "알림 전달 실패 또는 영구 실패가 있음",
  NOTIFICATION_PLATFORM_BACKLOG: "알림 전달 실패 또는 처리 지연이 있음",
  AI_JOB_FAILED: "AI 작업 상태가 실패로 확인됨",
  AI_JOB_STALE: "AI 작업이 정체 판단 기준을 넘김",
  SESSION_CLOSING_BLOCKED: "모임 마감 상태에 확인할 항목이 있음",
};

function detectionCriterion(summaryCode: string): string {
  return DETECTION_CRITERIA[summaryCode] ?? "현재 관측 출처의 운영 신호 기준을 충족";
}

function formatTime(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "시각 확인 필요" : KOREAN_TIME.format(date);
}

function formatLedgerTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "시각 확인 필요";
  const parts = LEDGER_TIME.formatToParts(date);
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;
  const hour = parts.find((part) => part.type === "hour")?.value;
  const minute = parts.find((part) => part.type === "minute")?.value;
  if (!month || !day || !hour || !minute) return formatTime(value);
  return `${month}.${day} ${hour}:${minute}`;
}

function targetLedgerEntries(history: readonly SafeHistoryEvent[]) {
  return [...history]
    .sort((left, right) => {
      const byTime = Date.parse(right.occurredAt) - Date.parse(left.occurredAt);
      if (byTime !== 0 && Number.isFinite(byTime)) return byTime;
      return right.caseVersion - left.caseVersion;
    })
    .slice(0, 3)
    .map((event) => ({
      at: formatLedgerTime(event.occurredAt),
      sentence: `${HISTORY_LABELS[event.reasonCode] ?? "상태 변경 기록"} · ${adminCaseLifecycleLanguage(event.toState).primaryText}`,
    }));
}

function DocketNav({ traversal }: { traversal: AdminCaseTraversal }) {
  return (
    <nav className="docket-nav" aria-label="케이스 순회">
      <span className="count">케이스 {traversal.index + 1} / {traversal.total}</span>
      <span className="docket-nav__actions">
        <button
          type="button"
          className="btn btn-quiet btn-sm admin-operation-control--touch"
          disabled={traversal.onPrev == null}
          onClick={() => traversal.onPrev?.()}
        >
          ‹ 이전
        </button>
        <button
          type="button"
          className="btn btn-quiet btn-sm admin-operation-control--touch"
          disabled={traversal.onNext == null}
          onClick={() => traversal.onNext?.()}
        >
          다음 ›
        </button>
      </span>
    </nav>
  );
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
