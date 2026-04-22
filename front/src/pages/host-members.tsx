import { useCallback } from "react";
import HostMembers from "@/features/host/components/host-members";
import type { HostMemberListItem } from "@/shared/api/readmates";
import { readmatesFetch } from "@/shared/api/readmates";
import { useReadmatesData } from "./readmates-page-data";
import { ReadmatesPageState } from "./readmates-page";

export default function HostMembersPage() {
  const state = useReadmatesData(useCallback(() => readmatesFetch<HostMemberListItem[]>("/api/host/members"), []));

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
        <ReadmatesPageState state={state}>{(members) => <HostMembers initialMembers={members} />}</ReadmatesPageState>
      </section>
    </main>
  );
}
