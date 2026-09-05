import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";
import { TopNav } from "./top-nav";

describe("TopNav host chrome", () => {
  it("uses a full-bleed host header container", () => {
    const { container } = render(
      <MemoryRouter initialEntries={["/app/host"]}>
        <TopNav variant="host" memberName="김호스트" />
      </MemoryRouter>,
    );

    const header = container.querySelector("header.topnav");
    expect(header).toHaveAttribute("data-variant", "host");
    expect(header?.querySelector(".topnav-inner.topnav-inner--fluid")).toBeTruthy();
    expect(header?.querySelector(".container.topnav-inner")).toBeNull();
  });

  it("keeps guest and member headers in the constrained container", () => {
    const { container: guest } = render(
      <MemoryRouter initialEntries={["/"]}>
        <TopNav variant="guest" />
      </MemoryRouter>,
    );
    expect(guest.querySelector("header.topnav")).toHaveAttribute("data-variant", "guest");
    expect(guest.querySelector(".container.topnav-inner")).toBeTruthy();
    expect(guest.querySelector(".topnav-inner--fluid")).toBeNull();
  });
});
