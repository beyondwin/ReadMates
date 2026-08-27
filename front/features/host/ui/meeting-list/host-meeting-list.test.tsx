import { readFileSync } from "node:fs";
import path from "node:path";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { HostMeetingTocRow, HostMeetingTocSections } from "@/features/host/model/host-meeting-list-model";
import { findNestedLiveRegions } from "@/shared/testing/accessibility-checks";
import { HostMeetingList } from "./host-meeting-list";

const upcomingRow: HostMeetingTocRow = {
  id: "open-1",
  ordinalFolio: "No.7",
  title: "지구 끝의 온실",
  lifecycleLabel: "준비 중",
  attentionLabel: null,
  summary: "08-30 예정일",
  href: "/app/host/sessions/open-1",
};

const pastRow: HostMeetingTocRow = {
  id: "closed-1",
  ordinalFolio: "No.6",
  title: "소년이 온다",
  lifecycleLabel: "기록 정리 중",
  attentionLabel: "기록 확인 필요",
  summary: "기록 정리 중 · 08-15",
  href: "/app/host/sessions/closed-1",
};

const emptySections: HostMeetingTocSections = {
  upcoming: { rows: [], nextCursor: null },
  past: { rows: [], nextCursor: null },
};

const populatedSections: HostMeetingTocSections = {
  upcoming: { rows: [upcomingRow], nextCursor: null },
  past: { rows: [pastRow], nextCursor: null },
};

function renderList(overrides: Partial<Parameters<typeof HostMeetingList>[0]> = {}) {
  return render(
    <HostMeetingList
      sections={populatedSections}
      onLoadMoreUpcoming={vi.fn()}
      onLoadMorePast={vi.fn()}
      loadingMoreUpcoming={false}
      loadingMorePast={false}
      trashHref="/app/host/sessions?view=trash"
      newMeetingHref="/app/host/sessions/new"
      {...overrides}
    />,
  );
}

describe("HostMeetingList", () => {
  it("renders two section headers and TOC rows with folio, dotted leader, and mono summary", () => {
    renderList();

    expect(screen.getByRole("heading", { name: "다가오는 모임" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "지난 모임" })).toBeInTheDocument();

    const upcoming = screen.getByRole("list", { name: "다가오는 모임" });
    const upcomingItem = within(upcoming).getByRole("listitem");
    expect(upcomingItem.querySelector(".rm-meeting-toc__no.mono")).toHaveTextContent("No.7");
    expect(upcomingItem.querySelector(".rm-meeting-toc__leader")).toHaveAttribute("aria-hidden");
    expect(upcomingItem.querySelector(".rm-meeting-toc__summary.mono")).toHaveTextContent("08-30 예정일");
    expect(within(upcomingItem).getByRole("link", { name: "지구 끝의 온실" })).toHaveAttribute(
      "href",
      "/app/host/sessions/open-1",
    );

    const past = screen.getByRole("list", { name: "지난 모임" });
    const pastItem = within(past).getByRole("listitem");
    expect(pastItem.querySelector(".rm-meeting-toc__no.mono")).toHaveTextContent("No.6");
    expect(pastItem.querySelector(".rm-meeting-toc__leader")).toHaveAttribute("aria-hidden");
    expect(pastItem.querySelector(".rm-meeting-toc__summary.mono")).toHaveTextContent("기록 정리 중 · 08-15");
    expect(within(pastItem).getByText("기록 확인 필요")).toBeInTheDocument();
  });

  it("keeps a quiet trash link at the bottom using trashHref", () => {
    renderList();

    const trash = screen.getByRole("link", { name: "휴지통" });
    expect(trash).toHaveAttribute("href", "/app/host/sessions?view=trash");
    expect(trash).toHaveClass("rm-meeting-toc__trash");
    expect(trash.className).toMatch(/btn-quiet|quiet/);
  });

  it("shows the first-use empty copy among the four empty-state variants", () => {
    renderList({ sections: emptySections });

    expect(screen.getAllByRole("link", { name: "첫 모임 만들기" })).toHaveLength(1);
    expect(screen.getByRole("link", { name: "첫 모임 만들기" })).toHaveAttribute(
      "href",
      "/app/host/sessions/new",
    );
    expect(screen.queryByText(/달성률|KPI|0%/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "휴지통" })).not.toBeInTheDocument();
  });

  it("shows a retryable inline failure instead of the first-meeting empty state", async () => {
    const onRetry = vi.fn();
    renderList({
      sections: emptySections,
      errorMessage: "모임을 불러오지 못했습니다.",
      onRetry,
    });

    expect(screen.getByText("모임을 불러오지 못했습니다.")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "첫 모임 만들기" })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "다시 시도" }));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it("loads more within each section independently", async () => {
    const onLoadMoreUpcoming = vi.fn();
    const onLoadMorePast = vi.fn();
    renderList({
      sections: {
        upcoming: { rows: [upcomingRow], nextCursor: "up-next" },
        past: { rows: [pastRow], nextCursor: "past-next" },
      },
      onLoadMoreUpcoming,
      onLoadMorePast,
    });

    const upcoming = screen.getByRole("region", { name: "다가오는 모임" });
    const past = screen.getByRole("region", { name: "지난 모임" });
    await userEvent.click(within(upcoming).getByRole("button", { name: "더 보기" }));
    await userEvent.click(within(past).getByRole("button", { name: "더 보기" }));
    expect(onLoadMoreUpcoming).toHaveBeenCalledOnce();
    expect(onLoadMorePast).toHaveBeenCalledOnce();
  });

  it("keeps list browse on one heading, one create action, and no page tabs", () => {
    renderList();

    const root = document.querySelector(".rm-meeting-toc") as HTMLElement | null;
    expect(root).not.toBeNull();
    expect(within(root!).getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(within(root!).getByRole("heading", { level: 1, name: "모임" })).toBeInTheDocument();
    expect(root!.querySelector("[role='tablist']")).toBeNull();
    expect(root!.querySelectorAll("[style]")).toHaveLength(0);
    expect(findNestedLiveRegions(root!)).toEqual([]);
    expect(within(root!).getAllByRole("link", { name: "새 모임 만들기" })).toHaveLength(1);
    expect(within(root!).getByRole("link", { name: "새 모임 만들기" })).toHaveAttribute(
      "href",
      "/app/host/sessions/new",
    );
  });

  it("uses editorial state grammar for loading and error", () => {
    const { rerender } = render(
      <HostMeetingList
        sections={emptySections}
        onLoadMoreUpcoming={vi.fn()}
        onLoadMorePast={vi.fn()}
        loadingMoreUpcoming={false}
        loadingMorePast={false}
        trashHref="/app/host/sessions?view=trash"
        newMeetingHref="/app/host/sessions/new"
        loading
      />,
    );
    expect(document.querySelector(".rm-meeting-toc__state")).toHaveAttribute("role", "status");
    expect(document.querySelector(".rm-meeting-toc__state")).toHaveTextContent("모임을 불러오는 중");

    rerender(
      <HostMeetingList
        sections={emptySections}
        onLoadMoreUpcoming={vi.fn()}
        onLoadMorePast={vi.fn()}
        loadingMoreUpcoming={false}
        loadingMorePast={false}
        trashHref="/app/host/sessions?view=trash"
        newMeetingHref="/app/host/sessions/new"
        errorMessage="모임을 불러오지 못했습니다."
        onRetry={vi.fn()}
      />,
    );
    expect(document.querySelector(".rm-meeting-toc__state")).toHaveAttribute("role", "alert");
    expect(screen.getByRole("button", { name: "다시 시도" }).closest(".rm-meeting-toc")).not.toBeNull();
  });

  it("imports meeting TOC styles from the list module and keeps the route CSS entry", () => {
    const listSource = readFileSync(path.resolve("features/host/ui/meeting-list/host-meeting-list.tsx"), "utf8");
    const routeSource = readFileSync(path.resolve("features/host/route/host-meeting-list-route.tsx"), "utf8");
    expect(listSource).toContain("meeting-toc.css");
    expect(routeSource).toContain("host-editorial-ledger.css");
  });
});
