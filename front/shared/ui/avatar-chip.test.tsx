import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AvatarChip, AVATAR_SIZE_ROLES, type AvatarSizeRole } from "./avatar-chip";

const expected = [
  ["navigation", 36, 36],
  ["dense", 30, 30],
  ["author", 36, 36],
  ["member", 38, 34],
  ["roster", 42, 38],
  ["profile", 88, 64],
  ["editor", 72, 72],
  ["picker", 64, 58],
] as const satisfies readonly (readonly [AvatarSizeRole, number, number])[];

describe("AvatarChip size roles", () => {
  it.each(expected)("maps %s to desktop %ipx and mobile %ipx", (role, desktop, mobile) => {
    const { container } = render(
      <AvatarChip avatarKey="banana-green-book" name="멤버" label="" sizeRole={role} />,
    );
    const avatar = container.querySelector<HTMLElement>(".rm-avatar-chip")!;
    expect(AVATAR_SIZE_ROLES[role]).toEqual({ desktop, mobile });
    expect(avatar).toHaveAttribute("data-avatar-size-role", role);
    expect(avatar.style.getPropertyValue("--avatar-size")).toBe(desktop + "px");
    expect(avatar.style.getPropertyValue("--avatar-mobile-size")).toBe(mobile + "px");
  });

  it("keeps explicit numeric sizing for raster inspection tests", () => {
    const { container } = render(
      <AvatarChip avatarKey="banana-green-book" name="멤버" label="" size={256} />,
    );
    const avatar = container.querySelector<HTMLElement>(".rm-avatar-chip")!;
    expect(avatar).not.toHaveAttribute("data-avatar-size-role");
    expect(avatar.style.getPropertyValue("--avatar-size")).toBe("256px");
    expect(avatar.style.getPropertyValue("--avatar-mobile-size")).toBe("256px");
  });
});
