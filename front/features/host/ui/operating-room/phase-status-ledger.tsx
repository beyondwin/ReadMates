import type { HostLinkComponent } from "@/features/host/ui/host-link-types";
import type { PhaseStatusLedgerRowView } from "@/features/host/model/host-operating-room-model";
import type { ReadmatesIconName } from "@/shared/ui/icon";
import { ReadmatesIcon } from "@/shared/ui/icon";
import { useOperatingRoomCompactViewport } from "./use-operating-room-compact-viewport";
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
  const compact = useOperatingRoomCompactViewport();
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
      <div className="rm-preparation-ledger__head rm-phase-status-ledger__head">
        <span>항목</span>
        <span>현황</span>
        <span>세부 내용</span>
        <span>관리</span>
      </div>
      <ol className="rm-preparation-ledger__list rm-phase-status-ledger__list">
        {rows.map((row, index) => {
          const glyph = liveGlyph(row.label);
          const actionName = compact ? row.action : `${row.label} ${row.action}`;
          return (
            <li
              key={row.label}
              className="rm-preparation-ledger-row rm-phase-status-ledger-row"
              aria-label={row.label}
              data-state={phaseValueState(row.value)}
            >
              <span className="rm-preparation-ledger-row__label rm-phase-status-ledger-row__label">
                {numbered ? (
                  <span className="rm-session-closing-board__step-index" data-index aria-hidden="true">
                    {index + 1}
                  </span>
                ) : glyph ? (
                  <ReadmatesIcon name={glyph} size={compact ? 24 : 16} />
                ) : null}
                <span className="rm-preparation-ledger-row__label-text">{row.label}</span>
              </span>
              <span className="rm-preparation-ledger-row__value rm-phase-status-ledger-row__value">{row.value}</span>
              <span className="rm-preparation-ledger-row__detail rm-phase-status-ledger-row__detail">{row.detail}</span>
              <span className="rm-preparation-ledger-row__actions rm-phase-status-ledger-row__actions">
                {row.href ? (
                  <LinkComponent
                    to={row.href}
                    className="rm-preparation-ledger-row__link rm-phase-status-ledger-row__link"
                    aria-label={actionName}
                  >
                    <span>{row.action}</span>
                    <ReadmatesIcon name="chevron-right" size={16} />
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

function phaseValueState(value: string): string {
  if (value === "완료") return "complete";
  if (value === "작성 중") return "in-progress";
  if (value === "확인 필요") return "warning";
  if (value === "대기" || value === "확인 전") return "pending";
  return "normal";
}
