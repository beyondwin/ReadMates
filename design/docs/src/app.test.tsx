import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { App } from "./app";

describe("Design system docs app", () => {
  it("renders real design-system primitives and migration status", () => {
    render(<App />);

    expect(screen.getByRole("heading", { name: /Primitives/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "저장" })).toHaveClass("btn-primary");
    expect(screen.getByText("TopNav / MobileHeader / MobileTabBar")).toBeInTheDocument();
    expect(screen.getByText("legacy")).toBeInTheDocument();
  });
});
