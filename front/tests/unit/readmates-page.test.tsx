import { readFileSync } from "node:fs";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useReadmatesData } from "@/src/pages/readmates-page-data";
import { ReadmatesPageState } from "@/src/pages/readmates-page";

type TestData = {
  label: string;
};

function TestReadmatesPage({ load }: { load: () => Promise<TestData> }) {
  const state = useReadmatesData(load);

  return (
    <ReadmatesPageState state={state} loadingLabel="Loading test data">
      {(data) => <main>{data.label}</main>}
    </ReadmatesPageState>
  );
}

afterEach(cleanup);

describe("useReadmatesData", () => {
  it("uses a shell-aware host loading skeleton from the current route", () => {
    render(
      <MemoryRouter initialEntries={["/app/host"]}>
        <ReadmatesPageState state={{ status: "loading" }} loadingLabel="Host loading">
          {() => <main>ready</main>}
        </ReadmatesPageState>
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

  it("keeps ready data mounted while a route refresh is pending", async () => {
    let resolveRefresh: (data: TestData) => void = () => {};
    const refreshPromise = new Promise<TestData>((resolve) => {
      resolveRefresh = resolve;
    });
    const load = vi
      .fn<() => Promise<TestData>>()
      .mockResolvedValueOnce({ label: "ready data" })
      .mockReturnValueOnce(refreshPromise);

    render(<TestReadmatesPage load={load} />);

    expect(await screen.findByText("ready data")).toBeInTheDocument();

    act(() => {
      window.dispatchEvent(new Event("readmates:route-refresh"));
    });

    await waitFor(() => expect(load).toHaveBeenCalledTimes(2));
    expect(screen.queryByText("Loading test data")).not.toBeInTheDocument();
    expect(screen.getByText("ready data")).toBeInTheDocument();

    await act(async () => {
      resolveRefresh({ label: "refreshed data" });
      await refreshPromise;
    });

    expect(await screen.findByText("refreshed data")).toBeInTheDocument();
  });
});
