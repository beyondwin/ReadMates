import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Badge } from "./badge";

describe("Badge", () => {
  it("maps tones to the existing badge CSS contract", () => {
    render(
      <Badge tone="success" dot>
        발행됨
      </Badge>,
    );

    expect(screen.getByText("발행됨")).toHaveClass("badge", "badge-success", "badge-dot");
  });
});
