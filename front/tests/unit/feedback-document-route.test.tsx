import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import FeedbackDocumentRoutePage from "@/src/pages/feedback-document";
import FeedbackDocumentPrintRoutePage from "@/src/pages/feedback-print";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function setupBffStatus(status: number) {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("", { status })));
}

function setupBffJson(body: unknown) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      new Response(JSON.stringify(body), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    ),
  );
}

function renderFeedbackRoute(path: string, printMode = false) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route
          path="/app/feedback/:sessionId"
          element={printMode ? <FeedbackDocumentPrintRoutePage /> : <FeedbackDocumentRoutePage />}
        />
        <Route path="/app/feedback/:sessionId/print" element={<FeedbackDocumentPrintRoutePage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("Feedback document routes", () => {
  it("renders access denied when the BFF rejects feedback document access", async () => {
    setupBffStatus(403);

    renderFeedbackRoute("/app/feedback/00000000-0000-0000-0000-000000000301");

    expect(await screen.findByRole("heading", { name: "피드백 문서를 열람할 수 없습니다." })).toBeInTheDocument();
    expect(screen.getByText("이 문서는 해당 회차에 참석한 멤버만 볼 수 있습니다.")).toBeInTheDocument();
  });

  it("renders a quiet unavailable state when the feedback document is missing", async () => {
    setupBffStatus(404);

    renderFeedbackRoute("/app/feedback/missing-session");

    expect(await screen.findByRole("heading", { name: "아직 열람 가능한 피드백 문서가 없습니다." })).toBeInTheDocument();
    expect(screen.getByText("호스트가 피드백 문서를 등록하면 이 화면에서 확인할 수 있습니다.")).toBeInTheDocument();
  });

  it("renders the shared error state for unexpected BFF errors", async () => {
    setupBffStatus(500);

    renderFeedbackRoute("/app/feedback/service-error");

    expect(await screen.findByRole("heading", { name: "페이지를 불러오지 못했습니다." })).toBeInTheDocument();
  });

  it("renders print-route access errors without calling print", async () => {
    const printMock = vi.fn();
    setupBffStatus(403);
    vi.stubGlobal("print", printMock);

    renderFeedbackRoute("/app/feedback/00000000-0000-0000-0000-000000000301/print");

    expect(await screen.findByRole("heading", { name: "피드백 문서를 열람할 수 없습니다." })).toBeInTheDocument();
    expect(printMock).not.toHaveBeenCalled();
  });

  it("opens the browser print dialog after the print route renders a document", async () => {
    const printMock = vi.fn();
    setupBffJson({
      sessionId: "session-1",
      sessionNumber: 1,
      title: "독서모임 1차 피드백",
      subtitle: "팩트풀니스 · 2025.11.26",
      bookTitle: "팩트풀니스",
      date: "2025-11-26",
      fileName: "251126 1차.md",
      uploadedAt: "2026-04-20T09:00:00Z",
      metadata: [],
      observerNotes: [],
      participants: [],
    });
    vi.stubGlobal("print", printMock);

    renderFeedbackRoute("/app/feedback/session-1/print");

    expect(await screen.findByRole("heading", { name: "독서모임 1차 피드백" })).toBeInTheDocument();
    await waitFor(() => expect(printMock).toHaveBeenCalledTimes(1));
  });
});
