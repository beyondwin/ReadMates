import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Button } from "./button";

describe("Button", () => {
  it("renders the existing ReadMates button CSS contract", () => {
    render(
      <Button variant="primary" size="sm">
        저장
      </Button>,
    );

    const button = screen.getByRole("button", { name: "저장" });
    expect(button).toHaveAttribute("type", "button");
    expect(button).toHaveClass("btn", "btn-primary", "btn-sm");
  });

  it("allows submit buttons when forms need them", () => {
    render(<Button type="submit">보내기</Button>);

    expect(screen.getByRole("button", { name: "보내기" })).toHaveAttribute("type", "submit");
  });
});
