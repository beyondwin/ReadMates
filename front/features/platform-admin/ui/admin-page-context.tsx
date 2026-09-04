import type { ReactNode } from "react";
import { AdminPageFrame } from "./admin-page-frame";

export type AdminPageContextProps = {
  eyebrow?: ReactNode;
  heading?: ReactNode;
  headingId?: string;
  description?: ReactNode;
  freshness?: ReactNode;
  scope?: ReactNode;
  authority?: ReactNode;
  action?: ReactNode;
  leading?: ReactNode;
  children?: ReactNode;
};

export function AdminPageContext({
  eyebrow,
  heading,
  headingId,
  description,
  freshness,
  scope,
  authority,
  action,
  leading,
  children,
}: AdminPageContextProps) {
  const hasMeta = freshness != null || scope != null || authority != null;

  return (
    <div className="admin-page-context">
      {eyebrow != null && eyebrow !== false ? (
        <p className="admin-page-context__eyebrow">{eyebrow}</p>
      ) : null}
      <AdminPageFrame
        heading={heading}
        headingId={headingId}
        description={description}
        action={action}
        leading={leading}
      >
        {hasMeta ? (
          <div className="admin-page-context__meta">
            {freshness != null && freshness !== false ? (
              <p className="admin-page-context__freshness">{freshness}</p>
            ) : null}
            {scope != null && scope !== false ? (
              <p className="admin-page-context__scope">{scope}</p>
            ) : null}
            {authority != null && authority !== false ? (
              <p className="admin-page-context__authority">{authority}</p>
            ) : null}
          </div>
        ) : null}
        {children}
      </AdminPageFrame>
    </div>
  );
}
