import type { ReactNode } from "react";
import {
  AdminStatePanel,
  type AdminPageState,
  type AdminStateSource,
} from "./admin-state-panel";

export type AdminEvidenceLedgerProps = {
  label: string;
  count?: number;
  state: AdminPageState;
  sources?: readonly AdminStateSource[];
  controls?: ReactNode;
  action?: ReactNode;
  children?: ReactNode;
};

export function AdminEvidenceLedger({
  label,
  count,
  state,
  sources,
  controls,
  action,
  children,
}: AdminEvidenceLedgerProps) {
  return (
    <section className="admin-evidence-ledger" aria-label={label}>
      <header className="admin-evidence-ledger__header">
        <h2 className="admin-evidence-ledger__title">{label}</h2>
        {count != null ? <p className="admin-evidence-ledger__count">{count}건</p> : null}
        {controls ? <div className="admin-evidence-ledger__controls">{controls}</div> : null}
      </header>
      <AdminStatePanel state={state} sources={sources} action={action}>
        {children}
      </AdminStatePanel>
    </section>
  );
}
