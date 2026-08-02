import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PublicEntryActions } from "./public-entry-actions";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("PublicEntryActions", () => {
  it("always renders target-club browse and idempotent member-start actions", () => {
    render(<MemoryRouter><PublicEntryActions publicBasePath="/clubs/reading-sai" /></MemoryRouter>);

    expect(screen.getByRole("link", { name: "둘러보기" })).toHaveAttribute("href", "/clubs/reading-sai/app");
    expect(screen.getByRole("link", { name: "멤버로 시작" })).toHaveAttribute(
      "href",
      "/login?returnTo=%2Fclubs%2Freading-sai%2Fapp",
    );
  });
});
