import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DocumentPanel } from "./document-panel";

describe("DocumentPanel", () => {
  it("renders editorial document content with metadata and divided state", () => {
    render(
      <DocumentPanel eyebrow="Public note" title="읽기 소개" meta="가상 공개 클럽" divided>
        <p>책과 모임의 분위기를 짧게 소개합니다.</p>
      </DocumentPanel>,
    );

    const panel = screen.getByRole("region", { name: "읽기 소개" });
    expect(panel).toHaveClass("rm-document-panel", "rm-document-panel--divided");
    expect(screen.getByText("Public note")).toHaveClass("eyebrow");
    expect(screen.getByText("가상 공개 클럽")).toHaveClass("tiny");
  });

  it("renders footer content when provided", () => {
    render(
      <DocumentPanel title="세션 요약" footer={<span>마지막 업데이트: 오늘</span>}>
        <p>멤버가 읽을 요약 문장입니다.</p>
      </DocumentPanel>,
    );

    expect(screen.getByText("마지막 업데이트: 오늘")).toBeInTheDocument();
  });
});
