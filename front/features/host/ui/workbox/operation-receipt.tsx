import type { ComponentType, ReactNode } from "react";

export type OperationReceiptOutcome = "pending" | "success" | "partial" | "failure" | "unknown";

type ReceiptLinkProps = {
  to: string;
  className?: string;
  children: ReactNode;
};

const DefaultLink: ComponentType<ReceiptLinkProps> = ({ to, children, ...props }) => (
  <a {...props} href={to}>{children}</a>
);

const outcomeLabels: Record<OperationReceiptOutcome, string> = {
  pending: "처리 중",
  success: "완료",
  partial: "일부 완료",
  failure: "실패",
  unknown: "결과 확인 필요",
};

export type OperationReceiptProps = {
  outcome: OperationReceiptOutcome;
  title: string;
  detail: string;
  ledgerHref?: string | null;
  LinkComponent?: ComponentType<ReceiptLinkProps>;
};

export function OperationReceipt({
  outcome,
  title,
  detail,
  ledgerHref = null,
  LinkComponent = DefaultLink,
}: OperationReceiptProps) {
  const label = outcomeLabels[outcome];
  return (
    <section
      className="rm-operation-receipt"
      data-outcome={outcome}
      role="status"
      aria-label={`${title} · ${label}`}
    >
      <div className="rm-operation-receipt__heading">
        <strong>{title}</strong>
        <span>{label}</span>
      </div>
      <p>{detail}</p>
      {outcome === "unknown" && ledgerHref ? (
        <LinkComponent to={ledgerHref} className="rm-operation-receipt__ledger-link">
          알림 장부에서 결과 확인
        </LinkComponent>
      ) : null}
    </section>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function operationReceiptOutcome(value: string): OperationReceiptOutcome {
  if (value === "PENDING" || value === "PUBLISHING") return "pending";
  if (value === "PUBLISHED" || value === "SUCCESS" || value === "COMPLETED") return "success";
  if (value === "PARTIAL" || value === "PARTIALLY_PUBLISHED") return "partial";
  if (value === "FAILED" || value === "DEAD" || value === "FAILURE") return "failure";
  return "unknown";
}
