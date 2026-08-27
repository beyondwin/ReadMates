import { Link } from "react-router";
import { ADMIN_COPY } from "@/features/platform-admin/model/admin-copy";

export type AdminTargetLedgerEntry = {
  at: string;
  sentence: string;
};

export function AdminTargetLedgerInline({
  entries,
  moreHref,
}: {
  entries: ReadonlyArray<AdminTargetLedgerEntry>;
  moreHref: string;
}) {
  const visible = entries.slice(0, 3);

  return (
    <div className="ledger-inline">
      {visible.map((entry, index) => (
        <div className="li" key={`${entry.at}:${entry.sentence}:${index}`}>
          <time>{entry.at}</time>
          <span>{entry.sentence}</span>
        </div>
      ))}
      {visible.length === 0 ? (
        <p className="ledger-inline__empty">{ADMIN_COPY.targetLedger.empty}</p>
      ) : null}
      <Link className="ledger-inline__more" to={moreHref}>
        {ADMIN_COPY.targetLedger.more}
      </Link>
    </div>
  );
}
