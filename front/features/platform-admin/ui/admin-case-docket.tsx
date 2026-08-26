import type { ReactNode } from "react";

export type AdminCaseDocketProps = {
  label: string;
  title: ReactNode;
  identity?: ReactNode;
  status?: ReactNode;
  evidence?: ReactNode;
  history?: ReactNode;
  related?: ReactNode;
  actions?: ReactNode;
};

export function AdminCaseDocket({
  label,
  title,
  identity,
  status,
  evidence,
  history,
  related,
  actions,
}: AdminCaseDocketProps) {
  if (!hasTarget(title)) {
    return null;
  }

  return (
    <section className="admin-case-docket" aria-label={label}>
      <h2 className="admin-case-docket__title">{title}</h2>
      {identity != null && identity !== false ? (
        <p className="admin-case-docket__identity">{identity}</p>
      ) : null}
      {status != null && status !== false ? (
        <p className="admin-case-docket__status">{status}</p>
      ) : null}
      {evidence != null && evidence !== false ? (
        <div className="admin-case-docket__evidence">{evidence}</div>
      ) : null}
      {history != null && history !== false ? (
        <div className="admin-case-docket__history">{history}</div>
      ) : null}
      {related != null && related !== false ? (
        <div className="admin-case-docket__related">{related}</div>
      ) : null}
      {actions != null && actions !== false ? (
        <div className="admin-case-docket__actions">{actions}</div>
      ) : null}
    </section>
  );
}

function hasTarget(title: ReactNode) {
  return title != null && title !== false && title !== "";
}
