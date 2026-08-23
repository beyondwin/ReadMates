import type {
  DeployAttemptStripEntry,
  HealthEvidenceState,
} from "@/features/platform-admin/model/platform-admin-health-model";

const STATUS_LABEL: Record<DeployAttemptStripEntry["finalStatus"], string> = {
  SUCCEEDED: "성공",
  FAILED: "실패",
  RUNNING: "진행 중",
};

const STATUS_DOT_CLASS: Record<DeployAttemptStripEntry["finalStatus"], string> = {
  SUCCEEDED: "admin-health-deploy-strip__dot admin-health-deploy-strip__dot--ok",
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
    return <p className="admin-health-deploy-strip__empty">배포 원장이 비활성입니다.</p>;
  }
  if (!entries || entries.length === 0 || evidenceState === "empty") {
    return <p className="admin-health-deploy-strip__empty">아직 기록된 배포가 없습니다.</p>;
  }
  return (
    <ol className="admin-health-deploy-strip">
      {entries.map((entry) => (
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
            <p className="admin-health-deploy-strip__title">
              {entry.attemptId} · {entry.imageTag ?? "image-unknown"} · {STATUS_LABEL[entry.finalStatus]}
            </p>
            <time dateTime={entry.startedAt} className="admin-health-deploy-strip__time">
              {new Date(entry.startedAt).toLocaleString()}
            </time>
          </div>
        </li>
      ))}
    </ol>
  );
}
