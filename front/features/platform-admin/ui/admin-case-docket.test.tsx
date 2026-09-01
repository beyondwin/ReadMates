import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { findNestedLiveRegions, findUnnamedInteractiveElements } from "@/shared/testing/accessibility-checks";
import { AdminCaseDocket } from "./admin-case-docket";

describe("AdminCaseDocket", () => {
  it("is absent without a target", () => {
    const { container } = render(
      <AdminCaseDocket label="사건 기록" title={null} />,
    );

    expect(container.querySelector(".admin-case-docket")).toBeNull();
    expect(screen.queryByRole("region", { name: "사건 기록" })).not.toBeInTheDocument();
    expect(container).toBeEmptyDOMElement();
  });

  it("renders evidence, history, related work, and actions for a selected target", () => {
    const { container } = render(
      <AdminCaseDocket
        label="사건 기록"
        title="알림 실패"
        identity="club-reading-sai"
        status={<span>확인 전</span>}
        evidence={<p>최근 실패 4건</p>}
        history={<p>운영자가 확인함</p>}
        related={<a href="/admin/notifications">알림 운영</a>}
        actions={<button type="button">확인 처리</button>}
      />,
    );

    const docket = screen.getByRole("region", { name: "사건 기록" });
    expect(docket).toHaveClass("admin-case-docket");
    expect(screen.getByRole("heading", { name: "알림 실패" })).toBeInTheDocument();
    expect(screen.getByText("club-reading-sai")).toBeInTheDocument();
    expect(screen.getByText("확인 전")).toBeInTheDocument();
    expect(screen.getByText("최근 실패 4건")).toBeInTheDocument();
    expect(screen.getByText("운영자가 확인함")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "알림 운영" })).toHaveAttribute("href", "/admin/notifications");
    expect(screen.getByRole("button", { name: "확인 처리" })).toBeInTheDocument();
    expect(findUnnamedInteractiveElements(container)).toEqual([]);
    expect(findNestedLiveRegions(container)).toEqual([]);
  });

  it("renders commands before the recent ledger and does not nest history in actions", () => {
    render(
      <AdminCaseDocket
        label="사건 기록"
        title="알림 실패"
        evidence={<p>최근 실패 4건</p>}
        related={<a href="/admin/notifications">알림 운영</a>}
        actions={<button type="button">확인 처리</button>}
        history={<p>이 대상의 최근 기입</p>}
      />,
    );

    const actions = document.querySelector(".admin-case-docket__actions");
    const history = document.querySelector(".admin-case-docket__history");
    expect(actions).not.toBeNull();
    expect(history).not.toBeNull();
    expect(actions!.contains(history)).toBe(false);
    expect(Boolean(actions!.compareDocumentPosition(history!) & Node.DOCUMENT_POSITION_FOLLOWING)).toBe(true);
  });
});
