import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { AiEvidenceExcerpt } from "../api/aigen-contracts";
import { EvidencePanel } from "./EvidencePanel";

const evidence: AiEvidenceExcerpt[] = [
  {
    section: "HIGHLIGHTS",
    targetId: "highlight-0",
    ordinal: 0,
    turnId: "turn-1",
    startSeconds: 62,
    speakerName: "공개 회원",
    excerpt: "합성 발언 일부",
    truncated: true,
  },
  {
    section: "HIGHLIGHTS",
    targetId: "highlight-1",
    ordinal: 1,
    turnId: "turn-2",
    startSeconds: 125,
    speakerName: "다른 회원",
    excerpt: "다른 근거",
    truncated: false,
  },
];

describe("EvidencePanel", () => {
  it("lists only the selected target excerpts and expands its current-revision turn", async () => {
    const onExpand = vi.fn().mockResolvedValue({
      turnId: "turn-1",
      speakerName: "공개 회원",
      startSeconds: 62,
      text: "합성 발언 전체",
    });
    render(
      <EvidencePanel
        targetId="highlight-0"
        targetLabel="하이라이트 1"
        evidence={evidence}
        revision={7}
        invalidated={false}
        onExpand={onExpand}
      />,
    );

    expect(screen.getByText(/연결된 발언은 출처를 확인/)).toBeInTheDocument();
    expect(screen.getByText(/호스트가 결과 문장을 의미상 뒷받침하는지 판단/)).toBeInTheDocument();
    expect(screen.getByText(/공개 회원 · 01:02/)).toBeInTheDocument();
    expect(screen.queryByText("다른 근거")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "전체 발언 보기" }));
    await waitFor(() => expect(onExpand).toHaveBeenCalledWith("turn-1", 7));
    expect(await screen.findByText("합성 발언 전체")).toBeInTheDocument();
  });

  it("uses safe empty and invalidated states without implying grounding", () => {
    const { rerender } = render(
      <EvidencePanel
        targetId={null}
        targetLabel={null}
        evidence={evidence}
        revision={7}
        invalidated={false}
        onExpand={vi.fn()}
      />,
    );
    expect(screen.getByText("확인할 결과 블록을 선택해 주세요.")).toBeInTheDocument();

    rerender(
      <EvidencePanel
        targetId="highlight-0"
        targetLabel="하이라이트 1"
        evidence={evidence}
        revision={7}
        invalidated
        onExpand={vi.fn()}
      />,
    );
    expect(screen.getByText("직접 수정됨 — AI 근거 비활성")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "전체 발언 보기" })).not.toBeInTheDocument();
  });
});
