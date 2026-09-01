import { Link } from "@/src/app/router-link";
import { HOST_ROUTE_HREFS } from "@/shared/routing/host-route-destinations";
import { HostSettingsRoute } from "@/features/host/route/host-settings-route";
import { HostSettingsPage } from "@/features/host/ui/settings/host-settings-page";
import "@/features/host/ui/host-editorial-ledger.css";

export function HostSettingsRouteElement() {
  return (
    <HostSettingsPage>
      <HostSettingsRoute />
      <div className="surface-quiet stack rm-host-editorial-ledger__panel rm-host-editorial-ledger__state">
        <p className="small muted">현재 이메일로 보내는 기존 초대 기능은 별도 화면에서 계속 사용할 수 있습니다.</p>
        <div>
          <Link className="btn-quiet" to={HOST_ROUTE_HREFS.invitations}>
            기존 이메일 초대 관리
          </Link>
        </div>
      </div>
    </HostSettingsPage>
  );
}
