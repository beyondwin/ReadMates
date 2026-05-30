import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AdminBreadcrumb } from "./admin-breadcrumb";

describe("AdminBreadcrumb", () => {
  it("renders 'today' breadcrumb as a single label", () => {
    render(<AdminBreadcrumb routePath="today" />);
    expect(screen.getByText("오늘 할 일")).toBeInTheDocument();
  });

  it("renders 'clubs' breadcrumb as group · label", () => {
    render(<AdminBreadcrumb routePath="clubs" />);
    expect(screen.getByText(/운영/)).toBeInTheDocument();
    expect(screen.getByText(/클럽/)).toBeInTheDocument();
  });

  it("renders club detail breadcrumb with extra (club name)", () => {
    render(<AdminBreadcrumb routePath="clubs/:clubId" extra="샘플 클럽" />);
    expect(screen.getByText(/샘플 클럽/)).toBeInTheDocument();
  });

  it("renders the now-ready analytics route without a '준비 중' suffix", () => {
    render(<AdminBreadcrumb routePath="analytics" />);
    expect(screen.getByText("분석")).toBeInTheDocument();
    expect(screen.queryByText(/준비 중/)).not.toBeInTheDocument();
  });
});
