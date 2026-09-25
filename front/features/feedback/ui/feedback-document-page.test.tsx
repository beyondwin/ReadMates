import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { FeedbackDocumentView } from "@/features/feedback/model/feedback-document-model";
import FeedbackDocumentPage, { FeedbackDocumentUnavailablePage } from "@/features/feedback/ui/feedback-document-page";

describe("FeedbackDocumentUnavailablePage return context", () => {
  it("renders a reflection return link when member home supplied the return target", () => {
    render(
      <FeedbackDocumentUnavailablePage
        reason="missing"
        returnTarget={{
          href: "/app",
          label: "지난 모임 회고",
        }}
      />,
    );

    const returnLink = screen.getByRole("link", { name: "지난 모임 회고 돌아가기" });
    expect(returnLink).toHaveAttribute("href", "/app");
    expect(returnLink).toHaveTextContent("← 회고");
  });
});

const v1Participant: FeedbackDocumentView["participants"][number] = {
  number: 1,
  name: "이멤버5",
  role: "사례로 기준을 확인하는 참여자",
  style: ["질문의 전제를 먼저 확인했다."],
  contributions: ["의사결정 기준을 설명했다. [10:00]"],
  problems: [{ title: "적용 범위가 좁았다", core: "확장하지 않았다.", evidence: "근거 문장 [12:00]", interpretation: "조건을 함께 말한다." }],
  actionItems: ["적용 조건을 함께 말한다."],
  revealingQuote: { quote: "피하는 게 맞다고 봤어요.", context: "의사결정 장면", note: "기준이 행동으로 이어졌다." },
};

const v1Document: FeedbackDocumentView = {
  sessionId: "session-2",
  sessionNumber: 2,
  title: "독서모임 2차 피드백",
  subtitle: "테스트 책 · 2026.04.15",
  bookTitle: "테스트 책",
  date: "2026-04-15",
  fileName: "session-2-feedback.md",
  uploadedAt: "2026-04-16T09:00:00Z",
  metadata: [{ label: "일시", value: "2026.04.15 (수) · 19:40" }],
  observerNotes: ["판단 기준을 세우는 연습에 집중했다."],
  participants: [v1Participant],
};

const v2Document: FeedbackDocumentView = {
  ...v1Document,
  templateVersion: 2,
  overview: [{ label: "가장 좋았던 순간", value: "기준이라는 단어를 함께 다듬었다." }],
  highlights: [
    {
      title: "기준이 두 번 다듬어졌다",
      lines: [
        { speaker: "이멤버5", time: "10:00", text: "피하는 게 맞다고 봤어요." },
        { speaker: "김호스트", time: null, text: "시간 범위로 나눠 보면 어때요?" },
      ],
      why: "두 사람의 설명이 쌓였다.",
    },
  ],
  groupFeedback: {
    strengths: [{ title: "말뜻부터 맞췄다", evidence: "기준(10분~22분)", interpretation: "애매한 말을 확인했다." }],
    improvements: [{ title: "결론이 늦게 나온다", evidence: "두 사람에게 같은 지적", interpretation: "결론을 먼저 말한다." }],
    speakingShares: [
      { name: "이멤버5", percent: 55 },
      { name: "김호스트", percent: 45 },
    ],
    speakingNote: "녹음이 온전한 구간 기준",
    nextSteps: ["꼭 다룰 질문을 미리 표시한다."],
  },
  trend: {
    attendance: [
      { label: "1차", count: 3 },
      { label: "2차", count: 2 },
    ],
    phases: [{ label: "1차", text: "일반화 지적이 많았다" }],
    repeatedTasks: [{ task: "결론부터 말하기", detail: "이멤버5 1·2차", status: "진행 중" }],
  },
  followUpQuestions: ["기준은 누가 정하는가?"],
  participants: [
    {
      ...v1Participant,
      badges: ["2회 참여", "발언 55%"],
      journey: [
        { label: "1차", text: "사례가 길었다" },
        { label: "2차", text: "결론을 먼저 말했다" },
      ],
      achievements: ["1차 과제를 2차에 실천했다"],
      sessionQuotes: [{ time: "10:00", quote: "피하는 게 맞다고 봤어요.", note: "기준을 행동으로 옮긴 첫 발언이다." }],
    },
    { ...v1Participant, number: 2, name: "김호스트", badges: ["첫 기록"], baseline: ["결론으로 시작하는지"] },
  ],
};

describe("FeedbackDocumentPage v2 sections", () => {
  it("renders group sections, trend, and participant journey for v2 documents", () => {
    render(<FeedbackDocumentPage document={v2Document} />);

    const nav = screen.getByRole("navigation", { name: "문서 안 바로 가기" });
    expect(within(nav).getByRole("link", { name: "하이라이트" })).toHaveAttribute("href", "#feedback-highlights");
    expect(within(nav).getByRole("link", { name: "김호스트" })).toHaveAttribute("href", "#feedback-participant-2");

    expect(screen.getByText("가장 좋았던 순간")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "기준이 두 번 다듬어졌다" })).toBeInTheDocument();
    expect(screen.getByText("“시간 범위로 나눠 보면 어때요?”")).toBeInTheDocument();
    expect(screen.getByText("두 사람의 설명이 쌓였다.")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "말뜻부터 맞췄다" })).toBeInTheDocument();
    expect(screen.getByText("55%")).toBeInTheDocument();
    expect(screen.getByText("꼭 다룰 질문을 미리 표시한다.")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "회차별 참석 인원: 1차 3명, 2차 2명" })).toBeInTheDocument();
    expect(screen.getByRole("rowheader", { name: "결론부터 말하기" })).toBeInTheDocument();
    expect(screen.getByText("기준은 누가 정하는가?")).toBeInTheDocument();

    const first = document.getElementById("feedback-participant-1");
    expect(first).not.toBeNull();
    const firstSection = within(first as HTMLElement);
    expect(firstSection.getByText("발언 55%")).toBeInTheDocument();
    expect(firstSection.getByText("결론을 먼저 말했다")).toBeInTheDocument();
    expect(firstSection.getByText("1차 과제를 2차에 실천했다")).toBeInTheDocument();
    expect(firstSection.getByText("기준을 행동으로 옮긴 첫 발언이다.")).toBeInTheDocument();
    expect(firstSection.getByText("의사결정 기준을 설명했다.")).toBeInTheDocument();

    const second = within(document.getElementById("feedback-participant-2") as HTMLElement);
    expect(second.getByText("첫 기록")).toBeInTheDocument();
    expect(second.getByText("결론으로 시작하는지")).toBeInTheDocument();
  });

  it("keeps v1 documents in the original layout", () => {
    render(<FeedbackDocumentPage document={v1Document} />);

    expect(screen.queryByRole("navigation", { name: "문서 안 바로 가기" })).not.toBeInTheDocument();
    expect(screen.queryByText("오늘의 하이라이트")).not.toBeInTheDocument();
    expect(screen.getByText("의사결정 기준을 설명했다. [10:00]")).toBeInTheDocument();
    expect(screen.getByText("판단 기준을 세우는 연습에 집중했다.")).toBeInTheDocument();
  });
});
