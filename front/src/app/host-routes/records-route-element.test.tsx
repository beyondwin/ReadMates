import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider, useLocation } from "react-router";
import { describe, expect, it } from "vitest";
import type { HostSessionListItem } from "@/features/host/api/host-contracts";
import { HostRecordsRouteElement } from "./records-route-element";

function recordItem(): HostSessionListItem {
  return {
    sessionId: "session-7",
    sessionNumber: 7,
    title: "일곱 번째 모임",
    bookTitle: "기록의 책",
    bookAuthor: "기록 작가",
    bookImageUrl: null,
    date: "2026-08-30",
    startTime: "19:00",
    endTime: "21:00",
    locationLabel: "온라인",
    state: "CLOSED",
    visibility: "MEMBER",
    accessScope: "GUEST_READABLE",
    siteVisibility: "HIDDEN",
    recordStatus: "INCOMPLETE",
    needsAttention: true,
    hasDraft: false,
    liveRevision: 1,
    draftRevision: null,
    lastModifiedAt: null,
  };
}

function LocationProbe() {
  const location = useLocation();
  return (
    <output aria-label="상세 위치">
      {JSON.stringify({ pathname: location.pathname, state: location.state })}
    </output>
  );
}

describe("HostRecordsRouteElement", () => {
  it("opens a canonical session detail with explicit record-owned return state", async () => {
    const user = userEvent.setup();
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: Number.POSITIVE_INFINITY } },
    });
    const router = createMemoryRouter([
      {
        path: "/clubs/:clubSlug/app/host/records",
        loader: () => ({
          filters: { view: "active", search: "", state: null, recordStatus: null, needsAttention: null },
          page: {
            items: [recordItem()],
            nextCursor: null,
            summary: { needsAttentionCount: 1, incompletePublishedCount: 0, draftCount: 0 },
          },
          trashPage: null,
        }),
        element: <HostRecordsRouteElement />,
      },
      {
        path: "/clubs/:clubSlug/app/host/sessions/:sessionId",
        element: <LocationProbe />,
      },
    ], {
      initialEntries: ["/clubs/reading-sai/app/host/records?view=all#records"],
    });

    render(
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    );

    expect(await screen.findByRole("heading", { name: "기록" })).toBeVisible();
    expect(screen.getByRole("tablist", { name: "기록 상태" })).toBeVisible();
    expect(screen.queryByRole("region", { name: "기록 장부 요약" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "다가오는 모임" })).not.toBeInTheDocument();
    await user.click((await screen.findAllByRole("link", { name: "No.7 마감실 열기" }))[0]!);

    expect(screen.getByRole("status", { name: "상세 위치" })).toHaveTextContent(JSON.stringify({
      pathname: "/clubs/reading-sai/app/host/sessions/session-7",
      state: {
        readmatesReturnTo: "/clubs/reading-sai/app/host/records?view=all#records",
        readmatesReturnLabel: "기록으로",
      },
    }));
  });
});
