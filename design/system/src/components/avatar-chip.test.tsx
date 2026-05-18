import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AvatarChip } from "./avatar-chip";

describe("AvatarChip", () => {
  it("derives initials from a Korean display name and renders name + meta", () => {
    render(<AvatarChip name="민서 독자" meta="멤버" />);

    expect(screen.getByLabelText("민서 독자")).toBeInTheDocument();
    expect(screen.getByText("민독")).toBeInTheDocument();
    expect(screen.getByText("민서 독자")).toBeInTheDocument();
    expect(screen.getByText("멤버")).toBeInTheDocument();
  });

  it("honors explicit initials over derivation", () => {
    render(<AvatarChip name="Long English Reader Name" initials="LR" />);

    expect(screen.getByLabelText("Long English Reader Name")).toBeInTheDocument();
    expect(screen.getByText("LR")).toBeInTheDocument();
  });
});
