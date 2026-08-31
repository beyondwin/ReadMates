import type { PropsWithChildren } from "react";
import "./admin-shell.css";
import "./admin-page-patterns.css";
import "./admin-editorial-ledger.css";

export function AdminEditorialLedgerCtHarness({ children }: PropsWithChildren) {
  return <div style={{ width: "100%" }}>{children}</div>;
}
