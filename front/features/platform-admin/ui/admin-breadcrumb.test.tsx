import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AdminBreadcrumb } from "./admin-breadcrumb";

describe("AdminBreadcrumb", () => {
  it("renders 'today' breadcrumb as a single label", () => {
    render(<AdminBreadcrumb routePath="today" />);
    expect(screen.getByText("오늘 할 일")).toBeInTheDocument();
    expect(screen.queryByText("Command")).not.toBeInTheDocument();
  });

  it("renders 'clubs' as a primary destination without an English group", () => {
    render(<AdminBreadcrumb routePath="clubs" />);
    expect(screen.getByText("클럽")).toBeInTheDocument();
    expect(screen.queryByText("Command")).not.toBeInTheDocument();
  });

  it("nests club detail under 클럽 instead of a fifth primary item", () => {
    render(<AdminBreadcrumb routePath="clubs/:clubId" extra="샘플 클럽" />);
    expect(screen.getByText("클럽")).toBeInTheDocument();
    expect(screen.getByText("클럽 상세")).toBeInTheDocument();
    expect(screen.getByText("샘플 클럽")).toBeInTheDocument();
    expect(screen.queryByText("Command")).not.toBeInTheDocument();
  });

  it("nests service health under 서비스 with the unified Korean label", () => {
    render(<AdminBreadcrumb routePath="health" />);
    expect(screen.getByText("서비스")).toBeInTheDocument();
    expect(screen.getByText("서비스 건강")).toBeInTheDocument();
    expect(screen.queryByText("사건")).not.toBeInTheDocument();
    expect(screen.queryByText("Operations")).not.toBeInTheDocument();
  });

  it("nests analytics under 검토", () => {
    render(<AdminBreadcrumb routePath="analytics" />);
    expect(screen.getByText("검토")).toBeInTheDocument();
    expect(screen.getByText("분석")).toBeInTheDocument();
    expect(screen.queryByText("Review")).not.toBeInTheDocument();
    expect(screen.queryByText(/준비 중/)).not.toBeInTheDocument();
  });
});
