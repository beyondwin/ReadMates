import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AdminBreadcrumb } from "./admin-breadcrumb";

describe("AdminBreadcrumb", () => {
  it("오늘 브레드크럼은 내비 라벨과 같은 단어를 쓴다", () => {
    render(<AdminBreadcrumb routePath="today" />);
    expect(screen.getByLabelText("현재 위치")).toHaveTextContent("오늘");
    expect(screen.queryByText("오늘 할 일")).toBeNull();
  });

  it("renders 'today' breadcrumb as a single label", () => {
    render(<AdminBreadcrumb routePath="today" />);
    expect(screen.getByText("오늘")).toBeInTheDocument();
    expect(screen.queryByText("Command")).not.toBeInTheDocument();
  });

  it("renders 'clubs' as a primary destination without an English group", () => {
    render(<AdminBreadcrumb routePath="clubs" />);
    expect(screen.getByText("클럽")).toBeInTheDocument();
    expect(screen.queryByText("Command")).not.toBeInTheDocument();
  });

  it("nests club detail under 클럽 관리 instead of a fifth primary item", () => {
    render(<AdminBreadcrumb routePath="clubs/:clubId" extra="샘플 클럽" />);
    expect(screen.getByText("클럽 관리")).toBeInTheDocument();
    expect(screen.getByText("클럽 상세")).toBeInTheDocument();
    expect(screen.getByText("샘플 클럽")).toBeInTheDocument();
    expect(screen.queryByText("Command")).not.toBeInTheDocument();
  });

  it("nests service health under the centralized service label", () => {
    render(<AdminBreadcrumb routePath="health" />);
    expect(screen.getAllByText("서비스 상태")).toHaveLength(2);
    expect(screen.queryByText("사건")).not.toBeInTheDocument();
    expect(screen.queryByText("Operations")).not.toBeInTheDocument();
    expect(screen.queryByText("서비스", { exact: true })).not.toBeInTheDocument();
  });

  it("nests analytics under 처리 기록", () => {
    render(<AdminBreadcrumb routePath="analytics" />);
    expect(screen.getByText("처리 기록")).toBeInTheDocument();
    expect(screen.getByText("분석 부록")).toBeInTheDocument();
    expect(screen.queryByText("Review")).not.toBeInTheDocument();
    expect(screen.queryByText("검토")).not.toBeInTheDocument();
    expect(screen.queryByText(/준비 중/)).not.toBeInTheDocument();
  });

  it("renders emergency public takedown without a primary group parent", () => {
    render(<AdminBreadcrumb routePath="public-takedown" />);
    expect(screen.getByText("긴급 공개 회수")).toBeInTheDocument();
    expect(screen.queryByText("비상 레인")).not.toBeInTheDocument();
    expect(screen.queryByText("파이프라인")).not.toBeInTheDocument();
  });
});
