import { Link } from "@/src/app/router-link";
import { HOST_ROUTE_HREFS } from "@/shared/routing/host-route-destinations";
import { HostSettingsRoute } from "@/features/host/route/host-settings-route";
import "@/features/host/ui/host-editorial-ledger.css";

export function HostSettingsRouteElement() {
  return (
    <main className="rm-host-editorial-ledger rm-host-editorial-ledger--context">
      <section className="page-header-compact">
        <div className="container rm-host-editorial-ledger__context">
          <div className="eyebrow rm-host-editorial-ledger__eyebrow">운영 · 준비 경계</div>
          <h1 className="h1 editorial rm-host-editorial-ledger__heading">초대와 설정</h1>
          <p className="small rm-host-editorial-ledger__lede">
            초대 링크와 클럽 설정의 revision을 확인하고 안전하게 변경합니다.
          </p>
        </div>
      </section>
      <section className="container">
        <div className="stack">
          <HostSettingsRoute />
        <div className="surface-quiet stack rm-host-editorial-ledger__panel rm-host-editorial-ledger__state">
          <p className="small muted">현재 이메일로 보내는 기존 초대 기능은 별도 화면에서 계속 사용할 수 있습니다.</p>
          <div>
            <Link className="btn-quiet" to={HOST_ROUTE_HREFS.invitations}>
              기존 이메일 초대 관리
            </Link>
          </div>
        </div>
        </div>
      </section>
    </main>
  );
}
