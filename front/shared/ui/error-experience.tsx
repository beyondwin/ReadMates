import { Link } from "react-router";

export type ErrorExperienceAction = {
  label: string;
  href?: string;
  disabled?: boolean;
  onClick?: () => void;
};

type ErrorExperienceProps = {
  variant: "public" | "member" | "host" | "auth";
  eyebrow: string;
  heading: string;
  body: string;
  reassurance?: string;
  primaryAction: ErrorExperienceAction;
  secondaryAction?: ErrorExperienceAction;
  helpText?: string;
};

function ErrorAction({ action, primary = false }: { action: ErrorExperienceAction; primary?: boolean }) {
  const className = [
    "btn",
    primary ? "btn-primary rm-error-experience__primary" : "btn-quiet rm-error-experience__secondary",
  ].join(" ");

  if (action.href) {
    return (
      <Link className={className} to={action.href}>
        {action.label}
      </Link>
    );
  }

  return (
    <button
      type="button"
      className={className}
      disabled={action.disabled}
      onClick={action.onClick}
    >
      {action.label}
    </button>
  );
}

export function ErrorExperience({
  variant,
  eyebrow,
  heading,
  body,
  reassurance,
  primaryAction,
  secondaryAction,
  helpText,
}: ErrorExperienceProps) {
  return (
    <main className={`rm-error-experience rm-error-experience--${variant}`}>
      <div className="container rm-error-experience__frame">
        <section className="rm-error-experience__sheet" aria-labelledby="rm-error-title">
          <div className="rm-error-experience__folio" aria-hidden="true">
            <span>READMATES</span>
            <span>RECOVERY NOTE</span>
          </div>
          <div className="rm-error-experience__rule" aria-hidden="true" />
          <p className="rm-error-experience__eyebrow">{eyebrow}</p>
          <h1 id="rm-error-title" className="rm-error-experience__title editorial">
            {heading}
          </h1>
          <p className="rm-error-experience__body">{body}</p>
          {reassurance ? (
            <p className="rm-error-experience__reassurance">{reassurance}</p>
          ) : null}
          <div className="rm-error-experience__actions" role="group" aria-label="다음 단계">
            <ErrorAction action={primaryAction} primary />
            {secondaryAction ? <ErrorAction action={secondaryAction} /> : null}
          </div>
          {helpText ? <p className="rm-error-experience__help">{helpText}</p> : null}
        </section>
      </div>
    </main>
  );
}
