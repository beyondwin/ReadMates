import { Link } from "react-router-dom";
import type { PlatformAdminSelectedBrief } from "@/features/platform-admin/model/platform-admin-workbench-model";

type Props = {
  brief: PlatformAdminSelectedBrief | null;
};

export function AdminSelectedBrief({ brief }: Props) {
  if (!brief) {
    return (
      <section className="admin-selected-brief" aria-label="선택 항목 브리프">
        <p className="muted">선택할 작업이 없습니다.</p>
      </section>
    );
  }

  const primary = brief.primaryAction;
  return (
    <section className="admin-selected-brief" aria-label="선택 항목 브리프">
      <div className="admin-selected-brief__header">
        <p className="eyebrow">Selected brief</p>
        <h2 className="h3 editorial">{brief.item.name}</h2>
        <p className="tiny muted">
          {brief.item.slug} · {brief.item.primaryActionLabel} · {brief.item.reason}
        </p>
      </div>

      {brief.permissionNote ? (
        <p className="admin-selected-brief__notice">{brief.permissionNote}</p>
      ) : null}

      {brief.closingRisk ? (
        <div className="admin-selected-brief__checklist" aria-label="클로징 리스크">
          <div className="admin-selected-brief__check" data-state="blocked">
            <strong>No.{brief.closingRisk.sessionNumber} · {brief.closingRisk.bookTitle}</strong>
            <span>{brief.closingRisk.meetingDate}</span>
          </div>
          <div className="admin-selected-brief__check" data-state="blocked">
            <strong>{brief.closingRisk.stateLabel}</strong>
            <span>{brief.closingRisk.blockerLabel}</span>
          </div>
          <div className="admin-selected-brief__check" data-state="blocked">
            <strong>{brief.closingRisk.trackingLabel}</strong>
            <span>
              {[brief.closingRisk.ageLabel, brief.closingRisk.occurrenceLabel].filter(Boolean).join(" · ") ||
                "추적 정보 없음"}
            </span>
          </div>
        </div>
      ) : null}

      {brief.publishChecklist.length > 0 ? (
        <div className="admin-selected-brief__checklist" aria-label="공개 준비 체크리스트">
          {brief.publishChecklist.map((item) => (
            <div className="admin-selected-brief__check" data-state={item.passed ? "passed" : "blocked"} key={item.id}>
              <strong>{item.label}</strong>
              <span>{item.detail}</span>
            </div>
          ))}
        </div>
      ) : null}

      {primary.kind === "make-public" || primary.kind === "make-private" ? (
        <button type="button" className="btn btn-primary btn-sm" disabled={primary.disabled}>
          {primary.label}
        </button>
      ) : (
        <Link className="btn btn-primary btn-sm" to={primary.href} aria-disabled={primary.disabled ? "true" : undefined}>
          {primary.label}
        </Link>
      )}

      {primary.reason && !brief.permissionNote ? (
        <p className="tiny muted">{primary.reason}</p>
      ) : null}

      <div className="admin-selected-brief__links" aria-label="관련 화면">
        {brief.drillLinks.map((link) => (
          <Link key={`${link.label}:${link.href}`} to={link.href} className="admin-selected-brief__link">
            {link.label}
          </Link>
        ))}
      </div>
    </section>
  );
}
