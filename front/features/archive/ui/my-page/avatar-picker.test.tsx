import { render, screen, within } from "@testing-library/react";
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
    const selected = screen.getByRole("button", {
      name: "한 장 더 읽는 바나나, 초록 책을 읽는 바나나 선택",
    });
    expect(selected).toHaveAttribute("aria-pressed", "true");
    expect(within(selected).getByText("한 장 더 읽는 바나나")).toHaveClass(
      "rm-avatar-picker__label",
    );
    expect(selected.querySelector(".rm-avatar-chip")).toHaveAttribute(
      "data-avatar-size-role",
      "picker",
    );
    expect(selected.querySelector(".rm-avatar-picker__check")).toBeNull();
    expect(container.querySelector("svg")).toBeNull();
    expect(screen.getAllByText(/./, { selector: ".rm-avatar-picker__label" })).toHaveLength(30);

    await user.click(screen.getByRole("button", {
      name: "문장 사이의 구름, 초록 책을 읽는 구름 선택",
    }));
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
