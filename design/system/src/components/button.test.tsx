import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Button } from "./button";

describe("Button", () => {
  it("defaults to type=button so it does not submit forms unintentionally", () => {
    render(<Button>저장</Button>);

    expect(screen.getByRole("button", { name: "저장" })).toHaveAttribute("type", "button");
  });

  it("allows submit buttons when forms need them", () => {
    render(<Button type="submit">보내기</Button>);

    expect(screen.getByRole("button", { name: "보내기" })).toHaveAttribute("type", "submit");
  });
});
