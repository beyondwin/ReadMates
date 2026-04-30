import { useLoaderData } from "react-router-dom";
import type { HostMemberListPage } from "@/features/host/api/host-contracts";
import HostMembers, { type HostMembersLinkComponent } from "@/features/host/ui/host-members";
import { hostMembersActions } from "./host-members-data";

export function HostMembersRoute({ LinkComponent }: { LinkComponent?: HostMembersLinkComponent }) {
  const members = useLoaderData() as HostMemberListPage;

  return (
    <main className="rm-host-members-page">
      <section className="page-header-compact">
        <div className="container">
          <div className="eyebrow">운영 · 멤버 관리</div>
          <h1 className="h1 editorial" style={{ margin: "6px 0 4px" }}>
            멤버 관리
          </h1>
          <p className="small" style={{ color: "var(--text-2)", margin: 0 }}>
            멤버 상태와 이번 세션 참여 여부를 함께 확인합니다.
          </p>
        </div>
      </section>
      <section className="container rm-host-members-page__body">
        <HostMembers initialMembers={members} actions={hostMembersActions} LinkComponent={LinkComponent} />
      </section>
    </main>
  );
}
