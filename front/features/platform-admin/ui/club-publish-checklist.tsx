import type {
  PlatformAdminPermissionView,
  PlatformAdminSelectedClubBrief,
} from "@/features/platform-admin/model/platform-admin-workbench-model";

type Props = {
  club: PlatformAdminSelectedClubBrief;
  permissions: PlatformAdminPermissionView;
  saving?: boolean;
  onSetVisibility?: (publicVisibility: "PRIVATE" | "PUBLIC") => void;
};

export function ClubPublishChecklist({ club, permissions, saving = false, onSetVisibility }: Props) {
  const canUsePrimaryAction = permissions.canUpdateClub && !club.primaryAction.disabled;
  return (
    <section className="platform-admin-publish-checklist" aria-labelledby="platform-admin-publish-title">
      <div className="platform-admin-domains__header">
        <div>
          <p className="eyebrow">Publish readiness</p>
          <h3 id="platform-admin-publish-title" className="h4 editorial">
            공개 준비 체크리스트
          </h3>
        </div>
      </div>
      <div className="platform-admin-publish-checklist__items">
        {club.publishChecklist.map((item) => (
          <div
            className="platform-admin-publish-checklist__item"
            data-state={item.passed ? "passed" : "blocked"}
            key={item.id}
          >
            <span aria-hidden="true">{item.passed ? "통과" : "확인"}</span>
            <strong>{item.label}</strong>
            <span className="tiny muted">{item.detail}</span>
          </div>
        ))}
      </div>
      {club.primaryAction.reason &&
      !club.publishChecklist.some((item) => item.detail === club.primaryAction.reason) ? (
        <p className="tiny danger">{club.primaryAction.reason}</p>
      ) : null}
      <button
        type="button"
        className="btn btn-primary btn-sm"
        disabled={!canUsePrimaryAction || saving}
        onClick={() => {
          if (club.primaryAction.kind === "make-public") onSetVisibility?.("PUBLIC");
          if (club.primaryAction.kind === "make-private") onSetVisibility?.("PRIVATE");
        }}
      >
        {saving ? "저장 중" : club.primaryAction.label}
      </button>
      {!permissions.canUpdateClub ? (
        <p className="tiny muted">현재 역할은 공개 상태를 변경할 수 없습니다.</p>
      ) : null}
    </section>
  );
}
