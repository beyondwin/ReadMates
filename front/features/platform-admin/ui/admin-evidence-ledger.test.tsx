import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { findNestedLiveRegions } from "@/shared/testing/accessibility-checks";
import { AdminEvidenceLedger } from "./admin-evidence-ledger";

describe("AdminEvidenceLedger", () => {
  it("renders an empty ledger without treating absence as failure", () => {
    render(
      <AdminEvidenceLedger label="운영 사건" count={0} state="empty">
        <p>숨겨진 행</p>
      </AdminEvidenceLedger>,
    );

    expect(screen.getByRole("region", { name: "운영 사건" })).toBeInTheDocument();
    expect(screen.getByText("표시할 항목이 없습니다")).toBeInTheDocument();
    expect(screen.queryByText("숨겨진 행")).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(findNestedLiveRegions(document.body)).toEqual([]);
  });

  it("keeps confirmed rows when a secondary source is only partial", () => {
    render(
      <AdminEvidenceLedger
        label="운영 사건"
        count={4}
        state="partial"
        sources={[
          { id: "cases", label: "운영 사건", available: true },
          { id: "health", label: "서비스 건강", available: false },
        ]}
      >
        <p>확인된 큐</p>
      </AdminEvidenceLedger>,
    );

    expect(screen.getByRole("status")).toHaveTextContent("일부만 확인됨");
    expect(screen.getByText("서비스 건강")).toBeInTheDocument();
    expect(screen.getByText("확인된 큐")).toBeInTheDocument();
    expect(screen.getByText("확인된 큐").closest("[role='status']")).toBeNull();
    expect(screen.getAllByRole("status")).toHaveLength(1);
    expect(findNestedLiveRegions(document.body)).toEqual([]);
  });

  it("locks stale evidence in place and keeps the last confirmed rows", () => {
    render(
      <AdminEvidenceLedger
        label="운영 사건"
        state="stale"
        action={<button type="button">다시 불러오기</button>}
      >
        <p>마지막 확인 행</p>
      </AdminEvidenceLedger>,
    );

    const notice = screen.getByRole("status");
    expect(notice).toHaveTextContent("최신 상태가 아닙니다");
    expect(notice).not.toHaveAttribute("aria-live");
    expect(screen.getByText("마지막 확인 행")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "다시 불러오기" })).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(findNestedLiveRegions(document.body)).toEqual([]);
  });
});
