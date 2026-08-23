import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { HostMeetingListRow } from "@/features/host/model/host-meeting-list-model";
import { HostMeetingList } from "./host-meeting-list";

const row: HostMeetingListRow = {
  id: "open-1",
  ordinal: 7,
  title: "함께 읽는 모임",
  meetingDate: "2026-08-30",
  lifecycleLabel: "진행 중",
  nextAction: { label: "모임 열기", href: "/app/host/sessions/open-1" },
  readerProjection: "멤버에게 보임 · 공개 사이트에는 숨김",
  attention: ["참석 응답 확인"],
};

describe("HostMeetingList", () => {
  it("shows one first-meeting action and no sample KPI in the zero state", () => {
    render(<HostMeetingList rows={[]} nextCursor={null} loadingMore={false} onLoadMore={vi.fn()} />);

    expect(screen.getAllByRole("link", { name: "첫 모임 만들기" })).toHaveLength(1);
    expect(screen.queryByText(/달성률|KPI|0%/i)).not.toBeInTheDocument();
  });

  it("renders the server-owned row order and a direct work link", () => {
    render(<HostMeetingList rows={[row]} nextCursor={null} loadingMore={false} onLoadMore={vi.fn()} />);

    expect(screen.getByRole("heading", { name: "모임" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "모임 열기" })).toHaveAttribute(
      "href",
      "/app/host/sessions/open-1",
    );
    expect(screen.getByText("참석 응답 확인")).toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: /모임 제목/ })).not.toBeInTheDocument();
  });

  it("announces cursor recovery and moves focus to the list heading", () => {
    const { rerender } = render(
      <HostMeetingList rows={[row]} nextCursor={null} loadingMore={false} onLoadMore={vi.fn()} />,
    );

    rerender(
      <HostMeetingList
        rows={[row]}
        nextCursor={null}
        loadingMore={false}
        onLoadMore={vi.fn()}
        announcement="목록이 바뀌어 처음부터 다시 불러왔습니다."
        focusHeadingRevision={1}
      />,
    );

    expect(screen.getByRole("status")).toHaveTextContent("목록이 바뀌어 처음부터 다시 불러왔습니다.");
    expect(screen.getByRole("heading", { name: "모임" })).toHaveFocus();
  });
});
