import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { App } from "./app";

describe("Design system docs app", () => {
  it("renders the editorial gallery sections before component metadata", () => {
    render(<App />);

    expect(screen.getByRole("heading", { name: /ReadMates should feel calm/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Public" })).toHaveAttribute("href", "#public");
    expect(screen.getByRole("link", { name: "Member" })).toHaveAttribute("href", "#member");
    expect(screen.getByRole("heading", { name: "Public Literary Page" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Member Reading Desk" })).toBeInTheDocument();
  });

  it("renders real design-system gallery components and migration status", () => {
    render(<App />);

    const publicSection = screen.getByRole("region", { name: "Public Literary Page" });
    expect(within(publicSection).getByText("조용한 페이지들")).toBeInTheDocument();
    expect(within(publicSection).getByText("멤버 전용")).toHaveClass("badge");

    const memberSection = screen.getByRole("region", { name: "Member Reading Desk" });
    expect(within(memberSection).getByLabelText("민서 독자")).toBeInTheDocument();
    expect(screen.getAllByText("BookCover").length).toBeGreaterThan(0);
    expect(screen.getByText("TopNav / MobileHeader / MobileTabBar")).toBeInTheDocument();
    expect(screen.getByText("legacy")).toBeInTheDocument();
  });
});
