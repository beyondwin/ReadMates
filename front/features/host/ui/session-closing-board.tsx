import type { AnchorHTMLAttributes, ComponentType, ReactNode } from "react";
import type { SessionClosingBoardView, SessionClosingTone } from "@/features/host/model/session-closing-model";

export type SessionClosingLinkProps = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href"> & {
  to: string;
  children: ReactNode;
};

export type SessionClosingLinkComponent = ComponentType<SessionClosingLinkProps>;

type SessionClosingBoardProps = {
  view: SessionClosingBoardView;
  LinkComponent?: SessionClosingLinkComponent;
};

function PlainSessionClosingLink({ to, children, ...props }: SessionClosingLinkProps) {
  return (
    <a {...props} href={to}>
      {children}
    </a>
  );
}

export function SessionClosingBoard({ view, LinkComponent = PlainSessionClosingLink }: SessionClosingBoardProps) {
  return (
    <main className="rm-host-closing-board">
      <section className="page-header-compact">
        <div className="container">
          <div className="row-between rm-host-closing-board__header">
            <div>
              <div className="eyebrow">Session closing</div>
              <h1 className="h1 editorial">{view.title}</h1>
              <p className="body muted">{view.subtitle}</p>
            </div>
            <span className={badgeClass(view.statusTone)}>{view.statusLabel}</span>
          </div>
        </div>
      </section>

      <section className="container rm-host-closing-board__body">
        <section className="rm-reading-desk rm-host-closing-board__primary" aria-label="이번 회차 다음 조치">
          <div className="rm-host-closing-board__primary-copy">
            <div className="eyebrow">이번 회차 다음 조치</div>
            <p className="h3 editorial">{view.primaryAction.label}</p>
            <p className="body muted">{view.primaryAction.reason}</p>
          </div>
          <span className={badgeClass(view.primaryAction.tone)}>{view.primaryAction.label}</span>
          {view.primaryAction.href ? (
            <LinkComponent className="btn btn-primary" to={view.primaryAction.href}>
              {view.primaryAction.label}
            </LinkComponent>
          ) : null}
        </section>

        <section className="surface rm-host-closing-board__section" aria-label="마감 단계">
          <div className="eyebrow">마감 단계</div>
          <div className="rm-host-closing-board__checklist">
            {view.checklist.map((item) => (
              <article key={item.id} className="surface-quiet rm-host-closing-board__checklist-item">
                <div className="row-between rm-host-closing-board__checklist-row">
                  <strong>{item.label}</strong>
                  <span className={badgeClass(item.tone)}>{item.stateLabel}</span>
                </div>
                <p className="small muted">{item.detail}</p>
                {item.href ? (
                  <LinkComponent className="tiny mono" to={item.href}>
                    {item.actionLabel}
                  </LinkComponent>
                ) : (
                  <span className="tiny muted">{item.actionLabel}</span>
                )}
              </article>
            ))}
          </div>
        </section>

        <section className="surface rm-host-closing-board__section" aria-label="호스트 멤버 공개 표면 상태">
          <div className="eyebrow">호스트 문서 / 멤버 회고 / 공개 기록</div>
          <div className="rm-host-closing-board__surfaces">
            {view.surfaces.map((surface) => (
              <article key={surface.id} className="surface-quiet rm-host-closing-board__surface">
                <div className="row-between rm-host-closing-board__surface-row">
                  <h2 className="h3 editorial">{surface.title}</h2>
                  <span className={badgeClass(surface.tone)}>{surface.title}</span>
                </div>
                <p className="body muted">{surface.detail}</p>
                {surface.href ? (
                  <LinkComponent className="btn btn-quiet btn-sm" to={surface.href}>
                    {surface.actionLabel}
                  </LinkComponent>
                ) : null}
              </article>
            ))}
          </div>
        </section>

        <section className="surface rm-host-closing-board__section" aria-label="마감 증거">
          <div className="eyebrow">마감 증거</div>
          <dl className="rm-host-closing-board__evidence">
            {view.evidence.map((item) => (
              <div key={item.label}>
                <dt className="tiny muted">{item.label}</dt>
                <dd className="body">{item.value}</dd>
              </div>
            ))}
          </dl>
        </section>
      </section>
    </main>
  );
}

function badgeClass(tone: SessionClosingTone) {
  if (tone === "ok") return "badge badge-ok badge-dot";
  if (tone === "danger") return "badge badge-danger badge-dot";
  if (tone === "warn") return "badge badge-warn badge-dot";
  if (tone === "accent") return "badge badge-accent badge-dot";
  return "badge badge-dot";
}
