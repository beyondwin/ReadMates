import type { ComponentType, ReactNode } from "react";
import type { PreparationLedgerRowView } from "@/features/host/model/host-operating-room-model";

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
  onRetry?: (rowId: PreparationLedgerRowView["id"]) => void;
  LinkComponent?: ComponentType<PreparationLedgerLinkProps>;
};

const rowStateLabels: Record<PreparationLedgerRowView["state"], string> = {
  normal: "준비 중",
  warning: "확인 필요",
  complete: "완료",
  unavailable: "불러오지 못함",
};

export function PreparationLedgerRow({
  row,
  onRetry,
  LinkComponent = DefaultLink,
}: PreparationLedgerRowProps) {
  return (
    <li
      className="rm-preparation-ledger-row"
      aria-label={row.label}
      data-state={row.state}
    >
      <span className="rm-preparation-ledger-row__label">{row.label}</span>
      <span className="rm-preparation-ledger-row__value">{row.value}</span>
      <span className="rm-preparation-ledger-row__detail">{row.detail}</span>
      <span className="rm-preparation-ledger-row__state">{rowStateLabels[row.state]}</span>
      <span className="rm-preparation-ledger-row__actions">
        {row.href ? (
          <LinkComponent
            to={row.href}
            className="rm-preparation-ledger-row__link"
            aria-label={`${row.label} 자세히 보기`}
          >
            자세히 보기
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
