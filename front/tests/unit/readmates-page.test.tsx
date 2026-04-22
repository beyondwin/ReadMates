import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
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
