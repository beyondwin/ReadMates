import {
  formatHealthTimestamp,
  type DeployAttemptStripEntry,
  type HealthEvidenceState,
} from "@/features/platform-admin/model/platform-admin-health-model";
import { adminHealthAvailabilityLanguage } from "@/features/platform-admin/model/admin-status-language";
import { AdminTechnicalDisclosure } from "@/features/platform-admin/ui/admin-technical-disclosure";

const STATUS_LABEL: Record<DeployAttemptStripEntry["finalStatus"], string> = {
  SUCCEEDED: "배포 성공",
  FAILED: "배포 실패",
  RUNNING: "배포 진행 중",
};

const STATUS_DOT_CLASS: Record<DeployAttemptStripEntry["finalStatus"], string> = {
  SUCCEEDED: "admin-health-deploy-strip__dot",
  FAILED: "admin-health-deploy-strip__dot admin-health-deploy-strip__dot--crit",
  RUNNING: "admin-health-deploy-strip__dot admin-health-deploy-strip__dot--running",
};

export type AdminHealthDeployStripProps = {
  entries: readonly DeployAttemptStripEntry[] | null;
  evidenceState?: HealthEvidenceState;
  lastKnown?: boolean;
};

export function AdminHealthDeployStrip({
  entries,
  evidenceState = entries && entries.length > 0 ? "ok" : "empty",
  lastKnown = false,
}: AdminHealthDeployStripProps) {
  if (evidenceState === "unavailable") {
    return <p className="admin-health-deploy-strip__empty">배포 원장을 확인할 수 없습니다.</p>;
  }
  if (evidenceState === "disabled") {
    return <p className="admin-health-deploy-strip__empty">배포 기록은 {adminHealthAvailabilityLanguage("DISABLED").primaryText} 상태입니다.</p>;
  }
  if (!entries || entries.length === 0 || evidenceState === "empty") {
    return <p className="admin-health-deploy-strip__empty">아직 기록된 배포가 없습니다.</p>;
  }
  return (
    <ol className="admin-health-deploy-strip">
      {entries.map((entry) => {
        const startedAt = formatHealthTimestamp(entry.startedAt);
        const endedAt = entry.endedAt ? formatHealthTimestamp(entry.endedAt) : null;
        return (
          <li key={entry.attemptId} className="admin-health-deploy-strip__item">
          <span
            className={
              lastKnown
                ? "admin-health-deploy-strip__dot admin-health-deploy-strip__dot--last-known"
                : STATUS_DOT_CLASS[entry.finalStatus]
            }
            aria-hidden
          />
          <div className="admin-health-deploy-strip__detail">
            <p className="admin-health-deploy-strip__title">{STATUS_LABEL[entry.finalStatus]}</p>
            {startedAt ? (
              <time dateTime={entry.startedAt} className="admin-health-deploy-strip__time">
                {startedAt}
              </time>
            ) : (
              <span className="admin-health-deploy-strip__time">시각 확인 불가</span>
            )}
            <AdminTechnicalDisclosure
              items={[
                { label: "배포 시도 ID", value: entry.attemptId },
                { label: "이미지 태그", value: entry.imageTag },
                { label: "최종 상태", value: entry.finalStatus },
                { label: "종료 시각", value: endedAt },
                {
                  label: "소요 시간(초)",
                  value: entry.durationSeconds == null ? null : String(entry.durationSeconds),
                },
              ]}
            />
          </div>
          </li>
        );
      })}
    </ol>
  );
}
