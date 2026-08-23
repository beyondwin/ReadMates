import type {
  ClubShellLinkComponent,
  ClubWorkspace,
  WorkspaceNavigationItem,
} from "../model/app-club-shell";

export type WorkspaceSelectorProps = {
  currentWorkspace: ClubWorkspace;
  items: ReadonlyArray<WorkspaceNavigationItem>;
  LinkComponent: ClubShellLinkComponent;
  onNavigate?: (item: WorkspaceNavigationItem) => void;
};

export function WorkspaceSelector({
  currentWorkspace,
  items,
  LinkComponent,
  onNavigate,
}: WorkspaceSelectorProps) {
  const current = items.find((item) => item.id === currentWorkspace);

  if (!current) {
    return null;
  }

  return (
    <details className="rm-context-selector rm-workspace-selector">
      <summary className="rm-context-selector__trigger rm-workspace-selector__trigger">
        <span className="rm-context-selector__kind">공간</span>
        <strong>{current.label}</strong>
        <SelectorChevron />
      </summary>
      <nav className="rm-context-selector__menu" aria-label="공간 선택">
        {items.map((item) => (
          <LinkComponent
            key={item.id}
            to={item.href}
            replace={item.navigation === "replace"}
            className={`rm-context-selector__item${item.id === currentWorkspace ? "" : " rm-workspace-switch"}`}
            aria-current={item.id === currentWorkspace ? "page" : undefined}
            onClick={() => onNavigate?.(item)}
          >
            {item.label}
          </LinkComponent>
        ))}
      </nav>
    </details>
  );
}

export function SelectorChevron() {
  return (
    <svg className="rm-context-selector__chevron" width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
      <path d="m3 5 4 4 4-4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
