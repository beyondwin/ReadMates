import type { HTMLAttributes, ReactNode } from "react";
import { cx } from "./classnames";

export type DocumentPanelTone = "default" | "quiet";

export type DocumentPanelProps = HTMLAttributes<HTMLElement> & {
  eyebrow?: string;
  title: string;
  meta?: ReactNode;
  footer?: ReactNode;
  tone?: DocumentPanelTone;
  divided?: boolean;
  children: ReactNode;
};

const toneClassName: Record<DocumentPanelTone, string> = {
  default: "",
  quiet: "rm-document-panel--quiet",
};

export function DocumentPanel({
  eyebrow,
  title,
  meta,
  footer,
  tone = "default",
  divided = false,
  className,
  children,
  ...props
}: DocumentPanelProps) {
  return (
    <section
      {...props}
      aria-label={title}
      className={cx("rm-document-panel", toneClassName[tone], divided && "rm-document-panel--divided", className)}
    >
      <header className="rm-document-panel__header">
        <div>
          {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
          <h3 className="h3">{title}</h3>
        </div>
        {meta ? <p className="tiny">{meta}</p> : null}
      </header>
      <div className="rm-document-panel__body">{children}</div>
      {footer ? <footer className="rm-document-panel__footer">{footer}</footer> : null}
    </section>
  );
}
