import { readFileSync } from "node:fs";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";
import { ReadmatesRouteLoading } from "@/src/pages/readmates-page";

afterEach(cleanup);

describe("ReadmatesRouteLoading", () => {
  it("uses a shell-aware host loading skeleton from the current route", () => {
    render(
      <MemoryRouter initialEntries={["/app/host"]}>
        <ReadmatesRouteLoading label="Host loading" />
      </MemoryRouter>,
    );

    expect(screen.getByRole("status")).toHaveTextContent("Host loading");
    expect(document.querySelector(".rm-route-loading--host")).toBeInTheDocument();
    expect(document.querySelector(".rm-loading-host-ledger")).toBeInTheDocument();
    expect(screen.queryByText("ready")).not.toBeInTheDocument();
  });

  it("defines reduced-motion fallbacks for route reveal and skeleton movement", () => {
    const css = readFileSync("src/styles/globals.css", "utf8");

    expect(css).toContain("@media (prefers-reduced-motion: reduce)");
    expect(css).toContain(".rm-route-reveal");
    expect(css).toContain("animation: none !important");
    expect(css).toContain(".rm-skeleton-line");
  });
});
