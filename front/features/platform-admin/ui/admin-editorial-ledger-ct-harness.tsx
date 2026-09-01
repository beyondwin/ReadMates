import type { PropsWithChildren } from "react";
import "./admin-shell.css";
import "./admin-page-patterns.css";
import "./admin-editorial-ledger.css";
import "./admin-club-management.css";

export function AdminEditorialLedgerCtHarness({ children }: PropsWithChildren) {
  return <div style={{ width: "100%" }}>{children}</div>;
}
