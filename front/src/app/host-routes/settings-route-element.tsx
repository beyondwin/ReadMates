import { Link } from "@/src/app/router-link";
import { HOST_ROUTE_HREFS } from "@/shared/routing/host-route-destinations";
import "@/features/host/ui/host-editorial-ledger.css";

export function HostSettingsRouteElement() {
  return (
    <main className="rm-host-editorial-ledger rm-host-editorial-ledger--context">
      <section className="page-header-compact">
        <div className="container rm-host-editorial-ledger__context">
          <div className="eyebrow rm-host-editorial-ledger__eyebrow">운영 · 준비 경계</div>
          <h1 className="h1 editorial rm-host-editorial-ledger__heading">초대와 설정</h1>
          <p className="small rm-host-editorial-ledger__lede">
            이름이 있는 초대 링크와 클럽 설정은 아직 제공되지 않습니다. 다음 구현 단계에서 권한과 변경 이력을 함께 연결합니다.
          </p>
        </div>
      </section>
      <section className="container">
        <div className="surface-quiet stack rm-host-editorial-ledger__panel rm-host-editorial-ledger__state">
          <p className="small muted">현재 이메일로 보내는 기존 초대 기능은 별도 화면에서 계속 사용할 수 있습니다.</p>
          <div>
            <Link className="btn-quiet" to={HOST_ROUTE_HREFS.invitations}>
              기존 이메일 초대 관리
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
