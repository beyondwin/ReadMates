import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AdminSupportRoute } from "./admin-support-route";

describe("AdminSupportRoute", () => {
  it("renders a light shell directing to club detail support tab", () => {
    render(<AdminSupportRoute />);
    expect(screen.getByRole("heading", { name: /지원/ })).toBeInTheDocument();
    expect(screen.getByText(/Support access 탭에서 관리합니다/)).toBeInTheDocument();
  });
});
