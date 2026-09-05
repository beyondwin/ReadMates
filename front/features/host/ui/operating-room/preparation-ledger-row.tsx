import type { ComponentType, ReactNode } from "react";
import type { PreparationLedgerRowView, PreparationRowId } from "@/features/host/model/host-operating-room-model";
import type { ReadmatesIconName } from "@/shared/ui/icon";
import { ReadmatesIcon } from "@/shared/ui/icon";
import { useOperatingRoomCompactViewport } from "./use-operating-room-compact-viewport";

export type PreparationLedgerLinkProps = {
  to: string;
  className?: string;
  "aria-label"?: string;
  children: ReactNode;
};

const DefaultLink: ComponentType<PreparationLedgerLinkProps> = ({ to, children, ...props }) => (
  <a {...props} href={to}>{children}</a>
);

export type PreparationLedgerRowProps = {
  row: PreparationLedgerRowView;
  index?: number;
  onRetry?: (rowId: PreparationLedgerRowView["id"]) => void;
  LinkComponent?: ComponentType<PreparationLedgerLinkProps>;
};

const rowStateLabels: Record<PreparationLedgerRowView["state"], string> = {
  normal: "준비 중",
  warning: "확인 필요",
  complete: "완료",
  unavailable: "불러오지 못함",
};

const rowGlyphs: Record<PreparationRowId, ReadmatesIconName> = {
  "schedule-seen": "calendar",
  rsvp: "people",
  questions: "notes",
  place: "pin",
};

export function PreparationLedgerRow({
  row,
  index,
  onRetry,
  LinkComponent = DefaultLink,
}: PreparationLedgerRowProps) {
  const compact = useOperatingRoomCompactViewport();
  const actionName = compact ? row.actionLabel : `${row.label} ${row.actionLabel}`;

  return (
    <li
      className="rm-preparation-ledger-row"
      aria-label={row.label}
      data-state={row.state}
    >
      {index != null ? (
        <span className="rm-preparation-ledger-row__index" data-prep-index aria-hidden="true">
          {String(index + 1).padStart(2, "0")}
        </span>
      ) : null}
      <span className="rm-preparation-ledger-row__label">
        <ReadmatesIcon name={rowGlyphs[row.id]} size={compact ? 24 : 16} />
        <span className="rm-preparation-ledger-row__label-text">{row.label}</span>
      </span>
      <span className="rm-preparation-ledger-row__value">{row.value}</span>
      <span className="rm-preparation-ledger-row__detail">{row.detail}</span>
      <span className="rm-preparation-ledger-row__state rm-sr-only">{rowStateLabels[row.state]}</span>
      <span className="rm-preparation-ledger-row__actions">
        {row.href ? (
          <LinkComponent
            to={row.href}
            className="rm-preparation-ledger-row__link"
            aria-label={actionName}
          >
            <span>{row.actionLabel}</span>
            <ReadmatesIcon name="chevron-right" size={16} />
          </LinkComponent>
        ) : null}
        {row.state === "unavailable" && onRetry ? (
          <button
            type="button"
            className="rm-preparation-ledger-row__retry"
            aria-label={`${row.label} 다시 불러오기`}
            onClick={() => onRetry(row.id)}
          >
            다시 불러오기
          </button>
        ) : null}
      </span>
    </li>
  );
}
