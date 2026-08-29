import { useEffect, useId, useRef, type KeyboardEvent } from "react";
import type {
  ClubNavigationItem,
  ClubWorkspace,
  WorkspaceNavigationItem,
} from "@/shared/model/app-club-shell";
import { AvatarChip } from "@/shared/ui/avatar-chip";
import { SelectorChevron } from "@/shared/ui/workspace-selector";
import "./host-shell.css";

export type HostWorkspaceSwitcherProps = {
  club: { name: string; slug: string; avatarKey: string };
  clubs: readonly ClubNavigationItem[];
  currentWorkspace: ClubWorkspace;
  workspaceItems: readonly WorkspaceNavigationItem[];
  disabledReason?: string | null;
  buildClubTarget: (slug: string, workspace: ClubWorkspace) => string;
  onSelectTarget: (href: string) => void;
};

function workspaceLabel(workspace: ClubWorkspace) {
  return workspace === "host" ? "호스트 운영실" : "멤버 공간";
}

export function HostWorkspaceSwitcher({
  club,
  clubs,
  currentWorkspace,
  workspaceItems,
  disabledReason,
  buildClubTarget,
  onSelectTarget,
}: HostWorkspaceSwitcherProps) {
  const detailsRef = useRef<HTMLDetailsElement>(null);
  const triggerRef = useRef<HTMLElement>(null);
  const instanceId = useId();
  const currentWorkspaceLabel = workspaceLabel(currentWorkspace);
  const accessibleLabel = `${club.name} · ${currentWorkspaceLabel}`;
  const clubsHeadingId = `host-clubs-${instanceId}`;
  const workspacesHeadingId = `host-workspaces-${instanceId}`;
  const unavailableReasonId = `host-workspace-unavailable-${instanceId}`;

  useEffect(() => {
    function dismissFromDocument(event: globalThis.KeyboardEvent) {
      if (event.key !== "Escape" || !detailsRef.current?.open) return;
      event.preventDefault();
      detailsRef.current.open = false;
      triggerRef.current?.focus();
    }

    document.addEventListener("keydown", dismissFromDocument);
    return () => document.removeEventListener("keydown", dismissFromDocument);
  }, []);

  function closeMenu({ restoreFocus = false } = {}) {
    if (detailsRef.current) detailsRef.current.open = false;
    if (restoreFocus) triggerRef.current?.focus();
  }

  function selectTarget(href: string) {
    closeMenu();
    onSelectTarget(href);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDetailsElement>) {
    if (event.key !== "Escape" || !detailsRef.current?.open) return;
    event.preventDefault();
    event.stopPropagation();
    closeMenu({ restoreFocus: true });
  }

  return (
    <details
      ref={detailsRef}
      className="rm-host-workspace-switcher"
      onKeyDown={handleKeyDown}
    >
      <summary
        ref={triggerRef}
        role="button"
        className="rm-host-workspace-switcher__trigger"
        aria-label={accessibleLabel}
      >
        <AvatarChip
          avatarKey={club.avatarKey}
          name={club.name}
          label=""
          sizeRole="navigation"
        />
        <span className="rm-host-workspace-switcher__identity" aria-hidden="true">
          <strong>{club.name}</strong>
          <span>{currentWorkspaceLabel}</span>
        </span>
        <SelectorChevron />
      </summary>

      <nav className="rm-host-workspace-switcher__menu" aria-label="클럽과 작업 공간 선택">
        <section aria-labelledby={clubsHeadingId}>
          <h2 id={clubsHeadingId}>클럽</h2>
          <div className="rm-host-workspace-switcher__choices">
            {clubs.map((item) => item.slug === club.slug ? (
              <span
                key={item.slug}
                className="rm-host-workspace-switcher__choice"
                aria-current="true"
              >
                {item.name}
              </span>
            ) : (
              <button
                key={item.slug}
                type="button"
                className="rm-host-workspace-switcher__choice"
                onClick={() => selectTarget(buildClubTarget(item.slug, currentWorkspace))}
              >
                {item.name}
              </button>
            ))}
          </div>
        </section>

        <section aria-labelledby={workspacesHeadingId}>
          <h2 id={workspacesHeadingId}>작업 공간</h2>
          <div className="rm-host-workspace-switcher__choices">
            {workspaceItems.map((item) => {
              if (item.id === currentWorkspace) {
                return (
                  <span
                    key={item.id}
                    className="rm-host-workspace-switcher__choice"
                    aria-current="page"
                  >
                    {workspaceLabel(item.id)}
                  </span>
                );
              }

              const unavailable = item.id === "host" && Boolean(disabledReason);
              return (
                <button
                  key={item.id}
                  type="button"
                  className="rm-host-workspace-switcher__choice"
                  disabled={unavailable}
                  aria-describedby={unavailable ? unavailableReasonId : undefined}
                  onClick={() => selectTarget(item.href)}
                >
                  {workspaceLabel(item.id)}
                </button>
              );
            })}
          </div>
          {disabledReason ? (
            <p id={unavailableReasonId} className="rm-host-workspace-switcher__reason">
              {disabledReason}
            </p>
          ) : null}
        </section>
      </nav>
    </details>
  );
}
