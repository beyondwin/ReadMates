import type { HostLinkComponent } from "@/features/host/ui/host-link-types";
import type { PhaseStatusLedgerRowView } from "@/features/host/model/host-operating-room-model";
import type { ReadmatesIconName } from "@/shared/ui/icon";
import { ReadmatesIcon } from "@/shared/ui/icon";
import "./operating-room.css";

const DefaultLink: HostLinkComponent = ({ to, children, ...props }) => (
  <a {...props} href={to}>{children}</a>
);

export type PhaseStatusLedgerProps = {
  title: string;
  rows: readonly PhaseStatusLedgerRowView[];
  LinkComponent?: HostLinkComponent;
};

export function PhaseStatusLedger({
  title,
  rows,
  LinkComponent = DefaultLink,
}: PhaseStatusLedgerProps) {
  const headingId = title === "현장 현황"
    ? "rm-phase-status-ledger-live-title"
    : title === "마감 현황"
      ? "rm-phase-status-ledger-closing-title"
      : "rm-phase-status-ledger-title";
  const numbered = title === "마감 현황";

  return (
    <section
      className="rm-preparation-ledger rm-phase-status-ledger"
      aria-labelledby={headingId}
      aria-label={title}
    >
      <h2 id={headingId}>{title}</h2>
      <ol className="rm-preparation-ledger__list">
        {rows.map((row, index) => {
          const glyph = liveGlyph(row.label);
          return (
            <li
              key={row.label}
              className="rm-preparation-ledger-row"
              aria-label={row.label}
            >
              <span className="rm-preparation-ledger-row__label">
                {numbered ? (
                  <span className="rm-phase-status-ledger-row__index" data-index aria-hidden="true">
                    {index + 1}
                  </span>
                ) : glyph ? (
                  <ReadmatesIcon name={glyph} size={16} />
                ) : null}
                {row.label}
              </span>
              <span className="rm-preparation-ledger-row__value">{row.value}</span>
              <span className="rm-preparation-ledger-row__detail">{row.detail}</span>
              <span className="rm-preparation-ledger-row__actions">
                {row.href ? (
                  <LinkComponent
                    to={row.href}
                    className="rm-preparation-ledger-row__link"
                    aria-label={`${row.label} 자세히 보기`}
                  >
                    {row.action}
                  </LinkComponent>
                ) : null}
              </span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function liveGlyph(label: string): ReadmatesIconName | null {
  if (label === "실제 출석") return "person";
  if (label === "참석 응답") return "people";
  if (label === "진행 순서") return "list";
  if (label === "현장 메모") return "notes";
  return null;
}
