import type { ReactNode } from "react";
import "@/features/host/ui/host-editorial-ledger.css";
import "./host-settings.css";

export function HostSettingsPage({
  children,
  createCta,
}: {
  children: ReactNode;
  createCta?: ReactNode;
}) {
  return (
    <main className="rm-host-editorial-ledger rm-host-editorial-ledger--context rm-host-settings-page">
      <header className="rm-host-settings__header">
        <h1 className="h1 editorial rm-host-editorial-ledger__heading">초대와 설정</h1>
        <p className="small rm-host-editorial-ledger__lede">
          새 멤버가 들어오는 경로와 클럽 운영 기준을 함께 관리하세요.
        </p>
        {createCta ?? (
          <button className="btn btn-primary" type="button">새 초대 링크</button>
        )}
      </header>
      {children}
    </main>
  );
}

export function HostSettingsColumns({
  invitations,
  clubSettings,
  extra,
}: {
  invitations?: ReactNode;
  clubSettings?: ReactNode;
  extra?: ReactNode;
}) {
  return (
    <div className="rm-host-settings-layout">
      <div>{invitations}</div>
      <div>
        {clubSettings}
        {extra}
      </div>
    </div>
  );
}
