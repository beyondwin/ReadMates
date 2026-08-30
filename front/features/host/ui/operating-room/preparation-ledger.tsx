import type { ComponentType } from "react";
import type { PreparationLedgerRowView } from "@/features/host/model/host-operating-room-model";
import {
  PreparationLedgerRow,
  type PreparationLedgerLinkProps,
} from "./preparation-ledger-row";
import "./operating-room.css";

export type PreparationLedgerProps = {
  rows: readonly PreparationLedgerRowView[];
  onRetry?: (rowId: PreparationLedgerRowView["id"]) => void;
  LinkComponent?: ComponentType<PreparationLedgerLinkProps>;
};

export function PreparationLedger({ rows, onRetry, LinkComponent }: PreparationLedgerProps) {
  return (
    <section
      className="rm-preparation-ledger"
      aria-labelledby="rm-preparation-ledger-title"
    >
      <h2 id="rm-preparation-ledger-title">준비 현황</h2>
      <ol className="rm-preparation-ledger__list">
        {rows.map((row) => (
          <PreparationLedgerRow
            key={row.id}
            row={row}
            onRetry={onRetry}
            LinkComponent={LinkComponent}
          />
        ))}
      </ol>
    </section>
  );
}
