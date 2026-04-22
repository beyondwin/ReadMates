import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import FeedbackDocumentPage, {
  FeedbackDocumentUnavailablePage,
} from "@/features/feedback/components/feedback-document-page";
import { feedbackDocumentContractFixture } from "./api-contract-fixtures";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const feedbackDocument = feedbackDocumentContractFixture;

describe("FeedbackDocumentPage", () => {
  it("renders the parsed feedback document content", () => {
    render(<FeedbackDocumentPage document={feedbackDocument} />);

    expect(screen.getByRole("heading", { name: "독서모임 1차 피드백" })).toBeInTheDocument();
    expect(screen.getByText("피드백 문서")).toBeInTheDocument();
    expect(screen.getByText("팩트풀니스 · 2025.11.26")).toBeInTheDocument();
    expect(screen.getByText("수치와 경험이 부딪힐 때 각자가 어떤 기준을 붙드는지가 선명하게 드러났다.")).toBeInTheDocument();
    expect(screen.getByText("좋은 질문은 정답을 찾기보다 자기 판단의 출처를 확인하게 만들었다.")).toBeInTheDocument();

    for (const name of ["이멤버5", "김호스트", "박민지"]) {
      expect(screen.getByText(name)).toBeInTheDocument();
    }

    expect(screen.getByText("출처 없는 수치로 책의 기준을 바로 흔들었다")).toBeInTheDocument();
    expect(screen.getByText("감각적으로 떠오른 숫자를 검증된 근거처럼 사용했다.")).toBeInTheDocument();
    expect(screen.getByText('"우리나라가 70퍼센트쯤은 이미 선진국 기준 아닐까요?" [00:12]')).toBeInTheDocument();
    expect(screen.getByText("문제를 제기하는 힘은 컸지만, 출처 확인이 늦어져 논점이 흐려졌다.")).toBeInTheDocument();
    expect(screen.getByText("다음 모임에서는 숫자를 말하기 전에 출처나 산식 중 하나를 함께 적는다.")).toBeInTheDocument();
    expect(screen.getByText("저는 일단 숫자로 반박하고 싶은 마음이 먼저 들어요.")).toBeInTheDocument();
    expect(screen.getByText("팩트풀니스의 데이터 해석 방식을 이야기하던 중 · [00:31]")).toBeInTheDocument();
    expect(screen.getByText("숫자를 검증 도구로 쓰려는 장점과 숫자에 기대어 결론을 서두르는 습관이 함께 드러났다.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "아카이브로 돌아가기" })).toHaveAttribute(
      "href",
      "/app/archive?view=report",
    );
    expect(screen.getByRole("link", { name: "PDF로 저장" })).toHaveAttribute(
      "href",
      "/app/feedback/session-1/print",
    );
  });

  it("keeps print output visually aligned with the screen document", () => {
    vi.stubGlobal("print", vi.fn());

    render(<FeedbackDocumentPage document={feedbackDocument} printMode />);

    const styleText = Array.from(document.querySelectorAll("style"))
      .map((style) => style.textContent ?? "")
      .join("\n");

    expect(styleText).toContain("@page");
    expect(styleText).toContain("print-color-adjust: exact");
    expect(styleText).toContain("background: var(--bg) !important");
    expect(styleText).toContain("max-width: 920px !important");
    expect(styleText).not.toContain("background: #fff !important");
    expect(styleText).not.toContain("max-width: none !important");
    expect(screen.getByRole("link", { name: "아카이브로 돌아가기" })).toHaveAttribute(
      "href",
      "/app/archive?view=report",
    );
    expect(screen.getByRole("link", { name: "문서로 돌아가기" })).toHaveAttribute(
      "href",
      "/app/feedback/session-1",
    );
  });

  it("encodes feedback document print and document-return hrefs", () => {
    render(<FeedbackDocumentPage document={{ ...feedbackDocument, sessionId: "session 1/slash" }} />);

    expect(screen.getByRole("link", { name: "PDF로 저장" })).toHaveAttribute(
      "href",
      "/app/feedback/session%201%2Fslash/print",
    );

    cleanup();
    vi.stubGlobal("print", vi.fn());
    render(<FeedbackDocumentPage document={{ ...feedbackDocument, sessionId: "session 1/slash" }} printMode />);

    expect(screen.getByRole("link", { name: "문서로 돌아가기" })).toHaveAttribute(
      "href",
      "/app/feedback/session%201%2Fslash",
    );
  });

  it("labels the missing state as a feedback document", () => {
    render(<FeedbackDocumentUnavailablePage reason="missing" />);

    expect(screen.getByText("피드백 문서")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "아직 열람 가능한 피드백 문서가 없습니다." })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "아카이브로 돌아가기" })).toHaveAttribute(
      "href",
      "/app/archive?view=report",
    );
  });

  it("uses viewer and full-member wording for locked feedback documents", () => {
    render(<FeedbackDocumentUnavailablePage reason="forbidden" />);

    expect(screen.getByText("열람 제한")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "피드백 문서는 정식 멤버와 참석자에게만 열립니다." })).toBeInTheDocument();
    expect(
      screen.getByText("둘러보기 멤버는 전체 세션 기록을 읽을 수 있지만, 회차 피드백 문서는 볼 수 없습니다."),
    ).toBeInTheDocument();
  });
});
