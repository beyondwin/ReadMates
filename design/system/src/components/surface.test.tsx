import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Divider, Surface } from "./surface";

describe("Surface", () => {
  it("maps tones to existing surface contracts", () => {
    render(<Surface tone="documentPanel">문서</Surface>);

    expect(screen.getByText("문서")).toHaveClass("rm-document-panel");
  });
});

describe("Divider", () => {
  it("renders hard and soft divider variants", () => {
    const { rerender } = render(<Divider />);

    expect(screen.getByRole("separator")).toHaveClass("divider");

    rerender(<Divider soft />);
    expect(screen.getByRole("separator")).toHaveClass("divider-soft");
  });
});
