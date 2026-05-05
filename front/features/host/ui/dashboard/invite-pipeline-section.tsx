import type { HostDashboardLinkComponent } from "./types";

const HOST_DASHBOARD_INVITE_PIPELINE_LABEL = "멤버 초대 관리";

export function InvitePipelineSection({
  mobile = false,
  LinkComponent,
}: {
  mobile?: boolean;
  LinkComponent: HostDashboardLinkComponent;
}) {
  return (
    <section className={mobile ? "m-card-quiet" : "surface-quiet"} style={{ padding: mobile ? undefined : "18px" }}>
      {!mobile ? (
        <div className="eyebrow" style={{ marginBottom: 8 }}>
          {HOST_DASHBOARD_INVITE_PIPELINE_LABEL}
        </div>
      ) : null}
      <div className="body" style={{ fontSize: "13.5px", fontWeight: 600 }}>
        초대 링크 생성, 대기, 수락, 만료 상태를 초대 화면에서 관리합니다.
      </div>
      <p className="tiny" style={{ margin: "6px 0 12px", color: "var(--text-3)" }}>
        보안상 초대 URL은 생성 직후에만 복사합니다. 기존 대기 초대는 취소하거나 새 링크를 발급하세요.
      </p>
      <LinkComponent to="/app/host/invitations" className="btn btn-ghost btn-sm">
        초대 관리 열기
      </LinkComponent>
    </section>
  );
}
