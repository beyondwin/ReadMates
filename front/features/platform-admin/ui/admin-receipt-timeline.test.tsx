import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { findNestedLiveRegions } from "@/shared/testing/accessibility-checks";
import {
  AdminReceiptTimeline,
  type AdminReceiptTimelineProps,
} from "./admin-receipt-timeline";

describe("AdminReceiptTimeline", () => {
  it("accepts only L2 and L3 command levels", () => {
    const levels: Array<AdminReceiptTimelineProps["level"]> = ["L2", "L3"];
    expect(levels).toEqual(["L2", "L3"]);
    // @ts-expect-error L1 cannot render a receipt timeline
    const l1: AdminReceiptTimelineProps["level"] = "L1";
    expect(l1).toBe("L1");
  });

  it("does not render when an L1 level is forced at runtime", () => {
    const { container } = render(
      <AdminReceiptTimeline
        level={"L1" as AdminReceiptTimelineProps["level"]}
        receiptId="receipt-1"
        entries={[{ key: "preview", label: "미리보기", state: "succeeded" }]}
      />,
    );

    expect(container.querySelector(".admin-receipt-timeline")).toBeNull();
    expect(screen.queryByText("receipt-1")).not.toBeInTheDocument();
    expect(screen.queryByText("미리보기")).not.toBeInTheDocument();
  });

  it("renders L2 receipt entries without inventing convergence", () => {
    render(
      <AdminReceiptTimeline
        level="L2"
        receiptId="receipt-onboarding"
        entries={[
          { key: "preview", label: "미리 확인", state: "succeeded", occurredAt: "19:00" },
          { key: "commit", label: "클럽 생성 확정", state: "pending" },
        ]}
        convergence={<p>공개 반영 추적</p>}
      />,
    );

    expect(screen.getByText("receipt-onboarding")).toBeInTheDocument();
    expect(screen.getByText("미리 확인")).toBeInTheDocument();
    expect(screen.getByText("클럽 생성 확정")).toBeInTheDocument();
    expect(screen.queryByText("공개 반영 추적")).not.toBeInTheDocument();
    expect(findNestedLiveRegions(document.body)).toEqual([]);
  });

  it("renders L3 receipt entries with convergence when provided", () => {
    render(
      <AdminReceiptTimeline
        level="L3"
        receiptId="receipt-takedown"
        entries={[
          { key: "preview", label: "대상 확인", state: "succeeded" },
          { key: "commit", label: "긴급 비공개", state: "unknown", detail: "결과를 확인하는 중" },
        ]}
        convergence={<p>공개 반영 추적</p>}
      />,
    );

    expect(screen.getByText("receipt-takedown")).toBeInTheDocument();
    expect(screen.getByText("긴급 비공개")).toBeInTheDocument();
    expect(screen.getByText("결과를 확인하는 중")).toBeInTheDocument();
    expect(screen.getByText("공개 반영 추적")).toBeInTheDocument();
  });
});
