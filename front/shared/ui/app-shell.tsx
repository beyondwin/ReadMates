import type { PropsWithChildren } from "react";

export function AppShell({ children }: PropsWithChildren) {
  return (
    <div className="rm-app-shell">
      <span className="rm-app-shell__title rm-sr-only">읽는사이</span>
      {children}
    </div>
  );
}
