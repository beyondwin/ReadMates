import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LivingArchivePreviewRoute } from "./living-archive-preview-route";

const route = vi.hoisted(() => ({
  loaderData: { clubSlug: "reading-sai", publicBasePath: "" },
}));
const queries = vi.hoisted(() => ({
  useQuery: vi.fn(),
}));
const previewSelector = 'meta[data-readmates-living-archive-preview="true"]';

vi.mock("@tanstack/react-query", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@tanstack/react-query")>()),
  useQuery: queries.useQuery,
}));

vi.mock("react-router", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react-router")>()),
  useLoaderData: () => route.loaderData,
}));

vi.mock("@/features/public/ui/living-archive-preview-page", () => ({
  LivingArchivePreviewPage: ({
    model,
    publicBasePath,
  }: {
    model: { clubName: string; latest: { sessionId: string } | null; readerTraces: unknown[] };
    publicBasePath: string;
  }) => (
    <output data-testid="living-archive-preview-page">
      {JSON.stringify({ clubName: model.clubName, latest: model.latest?.sessionId ?? null, traceCount: model.readerTraces.length, publicBasePath })}
    </output>
  ),
}));

const club = {
  clubName: "읽는사이",
  tagline: "함께 읽고 기록합니다.",
  about: "공개 독서 모임입니다.",
  stats: { sessions: 1, books: 1, members: 2 },
  recentSessions: [
    {
      sessionId: "session-3",
      sessionNumber: 3,
      bookTitle: "세 번째 책",
      bookAuthor: "저자 C",
      bookImageUrl: null,
      date: "2026-08-03",
      summary: "세 번째 공개 기록",
      highlightCount: 0,
      oneLinerCount: 1,
    },
  ],
};

const detail = {
  sessionId: "session-3",
  sessionNumber: 3,
  bookTitle: "세 번째 책",
  bookAuthor: "저자 C",
  bookImageUrl: null,
  date: "2026-08-03",
  summary: "세 번째 공개 기록",
  oneLiners: [{ authorName: "민지", authorShortName: "민", avatarKey: "minji", text: "첫 문장" }],
  highlights: [],
};

afterEach(() => {
  document.head.querySelectorAll(previewSelector).forEach((node) => node.remove());
  document.head.querySelectorAll("[data-readmates-page-head]").forEach((node) => node.remove());
});

describe("LivingArchivePreviewRoute", () => {
  beforeEach(() => {
    queries.useQuery.mockReset();
    queries.useQuery.mockImplementation((options: { queryKey: readonly string[] }) => {
      const queryKey = options.queryKey as readonly string[];
      return { data: queryKey.includes("session") ? detail : club } as never;
    });
  });

  it("reuses the public club cache and enables the latest-session query", () => {
    render(<LivingArchivePreviewRoute />);

    expect(screen.queryByTestId("living-archive-preview-head")).not.toBeInTheDocument();
    expect(document.head.querySelector(previewSelector)).toBeNull();
    expect(screen.getByTestId("living-archive-preview-page")).toHaveTextContent(
      JSON.stringify({ clubName: "읽는사이", latest: "session-3", traceCount: 1, publicBasePath: "" }),
    );
    expect(queries.useQuery).toHaveBeenCalledTimes(2);
    expect(queries.useQuery.mock.calls[0]?.[0]?.queryKey).toEqual(["public", "club", "reading-sai"]);
    expect(queries.useQuery.mock.calls[1]?.[0]).toMatchObject({
      queryKey: ["public", "club", "reading-sai", "session", "session-3"],
      enabled: true,
    });
  });

  it("disables the session query when the public club has no recent session", () => {
    queries.useQuery.mockImplementation((options: { queryKey: readonly string[] }) => {
      const queryKey = options.queryKey as readonly string[];
      return { data: queryKey.includes("session") ? null : { ...club, recentSessions: [] } } as never;
    });

    render(<LivingArchivePreviewRoute />);

    expect(queries.useQuery.mock.calls[1]?.[0]).toMatchObject({
      queryKey: ["public", "club", "reading-sai", "session", ""],
      enabled: false,
    });
  });
});
