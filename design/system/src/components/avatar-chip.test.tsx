import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AvatarChip } from "./avatar-chip";

describe("AvatarChip", () => {
  it("derives initials from a Korean display name and renders metadata", () => {
    render(<AvatarChip name="민서 독자" meta="멤버" />);

    expect(screen.getByText("민독")).toHaveClass("rm-avatar-chip");
    expect(screen.getByText("민서 독자")).toHaveClass("rm-avatar-chip-group__name");
    expect(screen.getByText("멤버")).toHaveClass("rm-avatar-chip-group__meta");
  });

  it("allows explicit initials and size variants", () => {
    render(<AvatarChip name="Long English Reader Name" initials="LR" size="lg" tone="muted" />);

    const chip = screen.getByLabelText("Long English Reader Name");
    expect(chip).toHaveClass("rm-avatar-chip-group", "rm-avatar-chip-group--lg", "rm-avatar-chip-group--muted");
    expect(screen.getByText("LR")).toBeInTheDocument();
  });
});
