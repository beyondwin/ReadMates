import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { OperationReceipt } from "./operation-receipt";

describe("OperationReceipt", () => {
  it.each([
    ["pending", "처리 중"],
    ["success", "완료"],
    ["partial", "일부 완료"],
    ["failure", "실패"],
    ["unknown", "결과 확인 필요"],
  ] as const)("presents the %s outcome without relying on color", (outcome, label) => {
    render(
      <OperationReceipt
        outcome={outcome}
        title="일정 알림"
        detail="서버가 반환한 작업 결과입니다."
        ledgerHref={outcome === "unknown" ? "/app/host/notifications" : null}
      />,
    );

    expect(screen.getByRole("status", { name: `일정 알림 · ${label}` })).toBeVisible();
    expect(screen.getByText(label)).toBeVisible();
  });

  it("offers only ledger reconciliation for an unknown outcome", () => {
    render(
      <OperationReceipt
        outcome="unknown"
        title="일정 알림"
        detail="같은 요청을 다시 보내지 마세요."
        ledgerHref="/clubs/reading-sai/app/host/notifications"
      />,
    );

    expect(screen.getByRole("link", { name: "알림 장부에서 결과 확인" })).toHaveAttribute(
      "href",
      "/clubs/reading-sai/app/host/notifications",
    );
    expect(screen.queryByRole("button", { name: /다시|재발송/ })).not.toBeInTheDocument();
  });
});
