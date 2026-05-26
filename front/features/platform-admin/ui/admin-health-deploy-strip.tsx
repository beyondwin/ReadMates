import type { DeployAttemptStripEntry } from "@/features/platform-admin/model/platform-admin-health-model";

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

export function AdminHealthDeployStrip({ entries }: { entries: DeployAttemptStripEntry[] }) {
  if (entries.length === 0) {
    return <p className="admin-health-deploy-strip__empty">아직 기록된 배포가 없습니다.</p>;
  }
  return (
    <ol className="admin-health-deploy-strip">
      {entries.map((entry) => (
        <li key={entry.attemptId} className="admin-health-deploy-strip__item">
          <span className={STATUS_DOT_CLASS[entry.finalStatus]} aria-hidden />
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
