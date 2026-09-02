import type { ReactNode } from "react";
import "@/features/host/ui/host-editorial-ledger.css";

export function HostSettingsPage({ children }: { children: ReactNode }) {
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
      <section className="container rm-host-editorial-ledger__body">
        {children}
      </section>
    </main>
  );
}
