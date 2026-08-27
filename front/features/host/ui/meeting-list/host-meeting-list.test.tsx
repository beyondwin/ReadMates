import { readFileSync } from "node:fs";
import path from "node:path";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { HostMeetingListRow } from "@/features/host/model/host-meeting-list-model";
import { findNestedLiveRegions } from "@/shared/testing/accessibility-checks";
import { HostMeetingList } from "./host-meeting-list";

const row: HostMeetingListRow = {
  id: "open-1",
  ordinal: 7,
  title: "함께 읽는 모임",
  meetingDate: "2026-08-30",
  lifecycleLabel: "준비 중",
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

  it("shows a retryable inline failure instead of the first-meeting empty state", async () => {
    const onRetry = vi.fn();
    render(
      <HostMeetingList
        rows={[]}
        nextCursor={null}
        loadingMore={false}
        onLoadMore={vi.fn()}
        errorMessage="모임을 불러오지 못했습니다."
        onRetry={onRetry}
      />,
    );

    expect(screen.getByText("모임을 불러오지 못했습니다.")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "첫 모임 만들기" })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "다시 시도" }));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it("imports editorial ledger styles from the list route entry", () => {
    const routeSource = readFileSync(path.resolve("features/host/route/host-meeting-list-route.tsx"), "utf8");
    expect(routeSource).toContain("host-editorial-ledger.css");
  });

  it("keeps list browse on one heading, one create action, and no page tabs", () => {
    render(<HostMeetingList rows={[row]} nextCursor="next" loadingMore={false} onLoadMore={vi.fn()} />);

    const root = document.querySelector(".rm-host-editorial-ledger") as HTMLElement | null;
    expect(root).not.toBeNull();
    expect(within(root!).getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(within(root!).getByRole("heading", { level: 1, name: "모임" })).toBeInTheDocument();
    expect(root!.querySelector("[role='tablist']")).toBeNull();
    expect(root!.querySelectorAll("[style]")).toHaveLength(0);
    expect(findNestedLiveRegions(root!)).toEqual([]);
    expect(within(root!).getAllByRole("link", { name: "새 모임 만들기" })).toHaveLength(1);
    expect(within(root!).getByRole("link", { name: "새 모임 만들기" })).toHaveClass(
      "rm-host-editorial-ledger__action",
    );
    expect(root!.querySelector(".rm-host-editorial-ledger__row .eyebrow")).toHaveTextContent("No.7");
    expect(root!.querySelector(".rm-host-editorial-ledger__row .eyebrow")).toHaveTextContent("준비 중");
    expect(within(root!).getByText("멤버에게 보임 · 공개 사이트에는 숨김")).toBeInTheDocument();
    expect(within(root!).getByText("참석 응답 확인")).toBeInTheDocument();
    expect(within(root!).getByRole("button", { name: "더 보기" })).toBeInTheDocument();
  });

  it("uses editorial state grammar for loading, empty, and error", () => {
    const { rerender } = render(
      <HostMeetingList rows={[]} nextCursor={null} loadingMore={false} onLoadMore={vi.fn()} loading />,
    );
    expect(document.querySelector(".rm-host-editorial-ledger__state")).toHaveAttribute("role", "status");
    expect(document.querySelector(".rm-host-editorial-ledger__state")).toHaveTextContent("모임을 불러오는 중");
    expect(document.querySelector(".rm-host-editorial-ledger")?.querySelectorAll("[style]")).toHaveLength(0);

    rerender(<HostMeetingList rows={[]} nextCursor={null} loadingMore={false} onLoadMore={vi.fn()} />);
    expect(document.querySelector(".rm-host-editorial-ledger__state")).toHaveTextContent("첫 모임을 준비해 보세요");
    expect(screen.getByRole("link", { name: "첫 모임 만들기" })).toHaveClass("rm-host-editorial-ledger__action");

    rerender(
      <HostMeetingList
        rows={[]}
        nextCursor={null}
        loadingMore={false}
        onLoadMore={vi.fn()}
        errorMessage="모임을 불러오지 못했습니다."
        onRetry={vi.fn()}
      />,
    );
    expect(document.querySelector(".rm-host-editorial-ledger__state")).toHaveAttribute("role", "alert");
    expect(screen.getByRole("button", { name: "다시 시도" }).closest(".rm-host-editorial-ledger")).not.toBeNull();
  });
});
