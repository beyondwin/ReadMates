import { useLoaderData } from "react-router-dom";
import {
  fetchHostMembers,
  submitHostMemberLifecycle,
  submitHostViewerAction,
} from "@/features/host/api/host-api";
import type { HostMemberListItem } from "@/features/host/api/host-contracts";
import HostMembers, { type HostMembersActions } from "@/features/host/components/host-members";

export function hostMembersLoader() {
  return fetchHostMembers();
}

const hostMembersActions = {
  loadMembers: fetchHostMembers,
  submitLifecycle: submitHostMemberLifecycle,
  submitViewerAction: submitHostViewerAction,
} satisfies HostMembersActions;

export function HostMembersRoute() {
  const members = useLoaderData() as HostMemberListItem[];

  return (
    <main>
      <section className="page-header-compact">
        <div className="container">
          <p className="eyebrow">운영 · 멤버 관리</p>
          <h1 className="h1 editorial" style={{ margin: "6px 0 4px" }}>
            멤버 관리
          </h1>
          <p className="small" style={{ color: "var(--text-2)", margin: 0 }}>
            멤버 상태와 이번 세션 참여 여부를 함께 확인합니다.
          </p>
        </div>
      </section>
      <section className="container" style={{ padding: "24px 0 72px" }}>
        <HostMembers initialMembers={members} actions={hostMembersActions} />
      </section>
    </main>
  );
}
