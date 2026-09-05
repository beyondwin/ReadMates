import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ReadmatesIcon, ReadmatesIconBadge } from "./icon";

describe("ReadmatesIcon", () => {
  it("renders a stroke svg with data-icon and aria-hidden by default", () => {
    const { container } = render(<ReadmatesIcon name="calendar" />);
    const svg = container.querySelector("svg")!;
    expect(svg.getAttribute("data-icon")).toBe("calendar");
    expect(svg.getAttribute("aria-hidden")).toBe("true");
    expect(svg.getAttribute("width")).toBe("20");
    expect(svg.getAttribute("stroke")).toBe("currentColor");
  });

  it("exposes a title as an accessible name when given", () => {
    const { getByRole } = render(<ReadmatesIcon name="bell" title="알림" />);
    expect(getByRole("img", { name: "알림" })).toBeTruthy();
  });

  it("renders filled variants without stroke", () => {
    const { container } = render(<ReadmatesIcon name="check-circle-filled" size={16} />);
    const svg = container.querySelector("svg")!;
    expect(svg.getAttribute("width")).toBe("16");
    expect(svg.querySelector("circle")?.getAttribute("fill")).toBe("currentColor");
  });

  it("wraps a badge with tone", () => {
    const { container } = render(<ReadmatesIconBadge name="alert-circle" tone="warn" />);
    const badge = container.querySelector(".rm-icon-badge")!;
    expect(badge.getAttribute("data-tone")).toBe("warn");
    expect(badge.querySelector('[data-icon="alert-circle"]')).toBeTruthy();
  });
});
