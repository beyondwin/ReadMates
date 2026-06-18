import type { SessionClosingBoardView, SessionClosingTone } from "@/features/host/model/session-closing-model";

type SessionClosingBoardProps = {
  view: SessionClosingBoardView;
};

export function SessionClosingBoard({ view }: SessionClosingBoardProps) {
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
        <section className="rm-reading-desk rm-host-closing-board__primary" aria-label="Next action">
          <div>
            <div className="eyebrow">Next action</div>
            <p className="h3 editorial">{view.primaryAction.label}</p>
          </div>
          {view.primaryAction.href ? (
            <a className="btn btn-primary" href={view.primaryAction.href}>
              {view.primaryAction.label}
            </a>
          ) : null}
        </section>

        <section className="surface rm-host-closing-board__section" aria-label="Closing checklist">
          <div className="eyebrow">Checklist</div>
          <div className="rm-host-closing-board__checklist">
            {view.checklist.map((item) => (
              <article key={item.id} className="surface-quiet rm-host-closing-board__checklist-item">
                <div className="row-between rm-host-closing-board__checklist-row">
                  <strong>{item.label}</strong>
                  <span className={badgeClass(item.tone)}>{checklistStateLabel(item.state)}</span>
                </div>
                <p className="small muted">{item.detail}</p>
                {item.href ? (
                  <a className="tiny mono" href={item.href}>
                    Open
                  </a>
                ) : null}
              </article>
            ))}
          </div>
        </section>

        <section className="surface rm-host-closing-board__section" aria-label="Surface status">
          <div className="eyebrow">Host / Member / Public</div>
          <div className="rm-host-closing-board__surfaces">
            {view.surfaces.map((surface) => (
              <article key={surface.id} className="surface-quiet rm-host-closing-board__surface">
                <div className="row-between rm-host-closing-board__surface-row">
                  <h2 className="h3 editorial">{surface.title}</h2>
                  <span className={badgeClass(surface.tone)}>{surface.id}</span>
                </div>
                <p className="body muted">{surface.detail}</p>
                {surface.href ? (
                  <a className="btn btn-quiet btn-sm" href={surface.href}>
                    Review
                  </a>
                ) : null}
              </article>
            ))}
          </div>
        </section>

        <section className="surface rm-host-closing-board__section" aria-label="Evidence ledger">
          <div className="eyebrow">Evidence ledger</div>
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

function checklistStateLabel(state: SessionClosingBoardView["checklist"][number]["state"]) {
  if (state === "DONE") return "Done";
  if (state === "BLOCKED") return "Blocked";
  if (state === "NOT_APPLICABLE") return "N/A";
  return "Needed";
}

function badgeClass(tone: SessionClosingTone) {
  if (tone === "ok") return "badge badge-ok badge-dot";
  if (tone === "danger") return "badge badge-danger badge-dot";
  if (tone === "warn") return "badge badge-warn badge-dot";
  if (tone === "accent") return "badge badge-accent badge-dot";
  return "badge badge-dot";
}
