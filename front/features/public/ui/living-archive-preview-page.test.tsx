import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";
import type { LivingArchivePreviewModel } from "@/features/public/model/living-archive-preview-model";
import { LivingArchivePreviewPage } from "./living-archive-preview-page";

const sessions = [
  {
    sessionId: "session-3",
    sessionNumber: 3,
    bookTitle: "세 번째 책",
    bookAuthor: "저자 C",
    bookImageUrl: null,
    date: "2026-08-03",
    summary: "세 번째 공개 기록",
    highlightCount: 2,
    oneLinerCount: 2,
  },
  {
    sessionId: "session-2",
    sessionNumber: 2,
    bookTitle: "두 번째 책",
    bookAuthor: "저자 B",
    bookImageUrl: null,
    date: "2026-07-03",
    summary: "두 번째 공개 기록",
    highlightCount: 1,
    oneLinerCount: 0,
  },
  {
    sessionId: "session-1",
    sessionNumber: 1,
    bookTitle: "첫 번째 책",
    bookAuthor: "저자 A",
    bookImageUrl: null,
    date: "2026-06-03",
    summary: "첫 번째 공개 기록",
    highlightCount: 0,
    oneLinerCount: 1,
  },
];

const model: LivingArchivePreviewModel = {
  clubName: "읽는사이",
  sessions,
  latest: sessions[0],
  latestDetail: {
    sessionId: "session-3",
    sessionNumber: 3,
    bookTitle: "세 번째 책",
    bookAuthor: "저자 C",
    bookImageUrl: null,
    date: "2026-08-03",
    summary: "세 번째 공개 기록",
    oneLiners: [
      { authorName: "민지", authorShortName: "민", avatarKey: "minji", text: "첫 문장" },
      { authorName: "준호", authorShortName: "준", avatarKey: "junho", text: "둘째 문장" },
    ],
    highlights: [
      { text: "셋째 문장", sortOrder: 1, authorName: "서연", authorShortName: "서", avatarKey: "seoyeon" },
    ],
  },
  readerTraces: [
    { id: "one-liner-0", index: 0, authorName: "민지", authorShortName: "민", avatarKey: "minji", text: "첫 문장", kind: "oneLiner" },
    { id: "one-liner-1", index: 1, authorName: "준호", authorShortName: "준", avatarKey: "junho", text: "둘째 문장", kind: "oneLiner" },
    { id: "highlight-0", index: 2, authorName: "서연", authorShortName: "서", avatarKey: "seoyeon", text: "셋째 문장", kind: "highlight" },
  ],
};

function renderPreview(previewModel: LivingArchivePreviewModel = model) {
  return render(
    <MemoryRouter>
      <LivingArchivePreviewPage model={previewModel} publicBasePath="/clubs/reading-sai" />
    </MemoryRouter>,
  );
}

describe("LivingArchivePreviewPage", () => {
  it("renders the approved shelf composition from public records", () => {
    const { container } = renderPreview();

    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.getByRole("heading", { level: 1, name: "책 사이에 사람이 남습니다" })).toBeVisible();
    expect(screen.getByText("서로 다른 문장이 한 권의 기억이 됩니다")).toBeVisible();
    expect(screen.getByText("ReadMates")).toBeVisible();
    expect(screen.getByText("읽는사이")).toBeVisible();
    expect(screen.getByLabelText("메뉴")).toBeVisible();

    const recordsLinks = screen.getAllByRole("link", { name: "공개 기록 보기" });
    expect(recordsLinks.length).toBeGreaterThanOrEqual(1);
    expect(recordsLinks[0]).toHaveAttribute("href", "/clubs/reading-sai/records");

    expect(screen.getAllByTestId("archive-spine")).toHaveLength(model.sessions.length);
    expect(screen.getAllByTestId("reader-trace")).toHaveLength(model.readerTraces.length);

    const latestLink = screen.getByRole("link", { name: /최근 대화 펼치기.*세 번째 책/ });
    expect(latestLink).toHaveAttribute("href", "/clubs/reading-sai/sessions/session-3");
    expect(within(latestLink).getByText("첫 문장")).toBeVisible();
    expect(within(latestLink).getByText("— 민지")).toBeVisible();
    expect(within(latestLink).queryByText("저자 C")).not.toBeInTheDocument();
    expect(latestLink.querySelector("blockquote")).toBeInTheDocument();
    expect(screen.getByText("최근 공개 기록 3권")).toBeVisible();
    expect(screen.queryByText("3권의 공개 기록")).not.toBeInTheDocument();

    const composition = Array.from(
      container.querySelectorAll(".living-archive-preview__header, .living-archive-preview__statement, .lap-shelf, .lap-editorial-strip"),
    );
    expect(composition.map((element) => element.className)).toEqual([
      "living-archive-preview__header",
      "living-archive-preview__statement",
      "lap-shelf",
      "lap-editorial-strip",
    ]);
  });

  it("uses the latest public list summary when optional session detail is unavailable", () => {
    renderPreview({ ...model, latestDetail: null, readerTraces: [] });

    expect(screen.queryAllByTestId("reader-trace")).toHaveLength(0);
    const latestLink = screen.getByRole("link", { name: /최근 대화 펼치기.*세 번째 책/ });
    expect(within(latestLink).getByText("세 번째 공개 기록")).toBeVisible();
    expect(latestLink.querySelector("blockquote")).not.toBeInTheDocument();
    expect(within(latestLink).queryByText("“")).not.toBeInTheDocument();
    expect(within(latestLink).queryByText(/^— /)).not.toBeInTheDocument();
  });

  it("keeps an honest empty shelf without invented books, dates, quotes, or readers", () => {
    const { container } = renderPreview({ clubName: "읽는사이", sessions: [], latest: null, latestDetail: null, readerTraces: [] });

    expect(screen.queryAllByTestId("archive-spine")).toHaveLength(0);
    expect(screen.queryAllByTestId("reader-trace")).toHaveLength(0);
    expect(screen.queryByText("세 번째 책")).not.toBeInTheDocument();
    expect(screen.queryByText("2026.08.03")).not.toBeInTheDocument();
    expect(screen.queryByText("첫 문장")).not.toBeInTheDocument();
    expect(container.querySelectorAll("img")).toHaveLength(0);
    expect(screen.getByRole("img", { name: "다음 자리" })).toBeVisible();
    expect(screen.getByText("첫 기록을 준비하고 있습니다")).toBeVisible();
    expect(screen.queryByRole("link", { name: /최근 대화 펼치기/ })).not.toBeInTheDocument();
  });
});
