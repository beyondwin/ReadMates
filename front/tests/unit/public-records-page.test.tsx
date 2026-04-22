import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import PublicRecordsPage from "@/src/pages/public-records";

function renderRecordsRoute() {
  render(
    <MemoryRouter initialEntries={["/records"]}>
      <Routes>
        <Route path="/records" element={<PublicRecordsPage />} />
        <Route path="/sessions/:sessionId" element={<main>session target</main>} />
        <Route path="/about" element={<main>about target</main>} />
      </Routes>
    </MemoryRouter>,
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("PublicRecordsPage", () => {
  it("redirects the public record entry route to the latest published session", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            recentSessions: [
              {
                sessionId: "session-6",
              },
            ],
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        ),
      ),
    );

    renderRecordsRoute();

    expect(await screen.findByText("session target")).toBeInTheDocument();
  });

  it("redirects to the club record list when there are no published sessions", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ recentSessions: [] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );

    renderRecordsRoute();

    expect(await screen.findByText("about target")).toBeInTheDocument();
  });
});
