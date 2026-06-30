import { useState } from "react";
import { Link } from "react-router-dom";
import type { AdminWorkspaceDestination } from "@/features/platform-admin/model/admin-workspace-switcher-model";

type Props = {
  accountLabel: string;
  destinations: AdminWorkspaceDestination[];
  onOtherAccountLogin: () => Promise<boolean>;
};

export function AdminWorkspaceSwitcher({ accountLabel, destinations, onOtherAccountLogin }: Props) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleOtherAccountLogin() {
    setBusy(true);
    setError(null);
    try {
      const ok = await onOtherAccountLogin();
      if (!ok) {
        setError("로그아웃에 실패했습니다. 다시 시도해 주세요.");
      }
    } catch {
      setError("로그아웃에 실패했습니다. 다시 시도해 주세요.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="admin-workspace-switcher">
      <button
        type="button"
        className="btn btn-ghost btn-sm admin-workspace-switcher__trigger"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((current) => !current)}
      >
        내 공간
      </button>
      {open ? (
        <div className="admin-workspace-switcher__menu" role="menu" aria-label="내 ReadMates 공간">
          <div className="admin-workspace-switcher__head">
            <p className="eyebrow">내 ReadMates 공간</p>
            <p className="tiny muted">{accountLabel}</p>
          </div>
          <div className="admin-workspace-switcher__list">
            {destinations.length === 0 ? (
              <p className="small admin-workspace-switcher__empty">이 계정으로 열 수 있는 클럽이 없습니다.</p>
            ) : (
              destinations.map((destination) => (
                <Link
                  key={destination.id}
                  to={destination.href}
                  aria-label={`${destination.clubName} ${destination.label}`}
                  className={`admin-workspace-switcher__item admin-workspace-switcher__item--${destination.priority}`}
                >
                  <span className="admin-workspace-switcher__club">{destination.clubName}</span>
                  <span className="admin-workspace-switcher__meta">
                    <span className="badge">{destination.role}</span>
                    <span className="badge">{destination.status}</span>
                    <span>{destination.label}</span>
                  </span>
                </Link>
              ))
            )}
          </div>
          <div className="admin-workspace-switcher__footer">
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              disabled={busy}
              onClick={() => void handleOtherAccountLogin()}
            >
              {busy ? "로그아웃 중" : "다른 계정으로 로그인"}
            </button>
            {error ? (
              <p className="small admin-workspace-switcher__error" role="alert">
                {error}
              </p>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
