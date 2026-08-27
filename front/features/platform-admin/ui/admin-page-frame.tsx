import { useId, type ReactNode } from "react";

export type AdminPageFrameProps = {
  heading: ReactNode;
  headingId?: string;
  description?: ReactNode;
  action?: ReactNode;
  children?: ReactNode;
};

export function AdminPageFrame({
  heading,
  headingId: headingIdProp,
  description,
  action,
  children,
}: AdminPageFrameProps) {
  const generatedId = useId();
  const headingId = headingIdProp ?? generatedId;

  return (
    <section className="admin-page-frame" aria-labelledby={headingId}>
      <header className="admin-page-frame__header">
        <div className="admin-page-frame__context">
          <h1 id={headingId} className="h1 editorial">
            {heading}
          </h1>
          {description ? <p className="admin-page-frame__description">{description}</p> : null}
        </div>
        {action ? <div className="admin-page-frame__action">{action}</div> : null}
      </header>
      {children}
    </section>
  );
}
