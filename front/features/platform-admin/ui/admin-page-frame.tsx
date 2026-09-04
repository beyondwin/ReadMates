import { useId, type ReactNode } from "react";

export type AdminPageFrameProps = {
  heading?: ReactNode;
  headingId?: string;
  description?: ReactNode;
  action?: ReactNode;
  leading?: ReactNode;
  children?: ReactNode;
};

function hasVisibleCopy(value: ReactNode): boolean {
  return value != null && value !== false && value !== "";
}

export function AdminPageFrame({
  heading,
  headingId: headingIdProp,
  description,
  action,
  leading,
  children,
}: AdminPageFrameProps) {
  const generatedId = useId();
  const headingId = headingIdProp ?? generatedId;
  const showHeading = hasVisibleCopy(heading);

  return (
    <section
      className="admin-page-frame"
      {...(showHeading ? { "aria-labelledby": headingId } : {})}
    >
      <header className="admin-page-frame__header">
        {leading ?? null}
        {showHeading ? (
          <div className="admin-page-frame__context">
            <h1 id={headingId} className="h1 editorial">
              {heading}
            </h1>
            {hasVisibleCopy(description) ? (
              <p className="admin-page-frame__description">{description}</p>
            ) : null}
          </div>
        ) : null}
        {hasVisibleCopy(action) ? <div className="admin-page-frame__action">{action}</div> : null}
      </header>
      {children}
    </section>
  );
}
