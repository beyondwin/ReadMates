import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AvatarPicker } from "./avatar-picker";

describe("AvatarPicker", () => {
  it("renders the catalog as a stateless accessible selection grid", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    const { container } = render(
      <AvatarPicker value="banana-green-book" onChange={onChange} disabled={false} />,
    );

    const choices = screen.getAllByRole("button", { name: /선택$/ });
    expect(choices).toHaveLength(30);
    expect(screen.getByRole("button", { name: "초록 책을 읽는 바나나 선택" }))
      .toHaveAttribute("aria-pressed", "true");
    expect(container.querySelectorAll(".rm-avatar-picker__check")).toHaveLength(1);

    await user.click(screen.getByRole("button", { name: "초록 책을 읽는 구름 선택" }));
    expect(onChange).toHaveBeenCalledWith("cloud-green-book");
  });

  it("disables every choice and connects an avatar error", () => {
    render(
      <AvatarPicker
        value="banana-green-book"
        onChange={vi.fn()}
        disabled
        errorId="avatar-error"
      />,
    );
    for (const choice of screen.getAllByRole("button", { name: /선택$/ })) {
      expect(choice).toBeDisabled();
      expect(choice).toHaveAttribute("aria-describedby", "avatar-error");
    }
  });
});
