import { readFileSync } from "node:fs";
import path from "node:path";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { HostMeetingTocRow, HostMeetingTocSections } from "@/features/host/model/host-meeting-list-model";
import { findNestedLiveRegions } from "@/shared/testing/accessibility-checks";
import { HostMeetingList } from "./host-meeting-list";

const upcomingRow = {
  id: "open-1",
  ordinalFolio: "No.7",
  title: "지구 끝의 온실",
  lifecycleLabel: "준비 중",
  attentionLabel: null,
  summary: "08-30 예정일",
  date: "2026-08-30",
  href: "/app/host/sessions/open-1",
} satisfies HostMeetingTocRow & { date: string };

const pastRow = {
  id: "closed-1",
  ordinalFolio: "No.6",
  title: "소년이 온다",
  lifecycleLabel: "기록 정리 중",
  attentionLabel: "기록 확인 필요",
  summary: "08-15",
  date: "2026-08-15",
  href: "/app/host/sessions/closed-1",
} satisfies HostMeetingTocRow & { date: string };

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
    expect(upcomingItem.querySelector(".rm-meeting-toc__lifecycle")).toHaveTextContent("준비 중");
    expect(upcomingItem.querySelector(".rm-meeting-toc__summary.mono")).toHaveTextContent("08-30 예정일");
    expect(within(upcomingItem).getByRole("link", { name: "지구 끝의 온실" })).toHaveAttribute(
      "href",
      "/app/host/sessions/open-1",
    );

    const past = screen.getByRole("list", { name: "지난 모임" });
    const pastItem = within(past).getByRole("listitem");
    expect(pastItem.querySelector(".rm-meeting-toc__no.mono")).toHaveTextContent("No.6");
    expect(pastItem.querySelector(".rm-meeting-toc__leader")).toHaveAttribute("aria-hidden");
    expect(pastItem.querySelector(".rm-meeting-toc__summary.mono")).toHaveTextContent("08-15");
    expect(pastItem.querySelector(".rm-meeting-toc__lifecycle")).toHaveTextContent("기록 정리 중");
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

  it("shows a retryable upcoming-section failure without hiding the past archive", async () => {
    const onRetry = vi.fn();
    renderList({
      sections: {
        upcoming: { rows: [], nextCursor: null },
        past: { rows: [pastRow], nextCursor: null },
      },
      errorMessage: "모임을 불러오지 못했습니다.",
      onRetry,
    });

    const upcoming = screen.getByRole("region", { name: "다가오는 모임" });
    expect(within(upcoming).getByText("모임을 불러오지 못했습니다.")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "지난 모임" })).toBeInTheDocument();
    expect(screen.getByText("소년이 온다")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "첫 모임 만들기" })).not.toBeInTheDocument();
    await userEvent.click(within(upcoming).getByRole("button", { name: "다시 시도" }));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it("announces cursor recovery and moves focus to the list heading", () => {
    const { rerender } = renderList();

    rerender(
      <HostMeetingList
        sections={populatedSections}
        onLoadMoreUpcoming={vi.fn()}
        onLoadMorePast={vi.fn()}
        loadingMoreUpcoming={false}
        loadingMorePast={false}
        trashHref="/app/host/sessions?view=trash"
        newMeetingHref="/app/host/sessions/new"
        announcement="목록이 바뀌어 처음부터 다시 불러왔습니다."
        focusHeadingRevision={1}
      />,
    );

    expect(screen.getByRole("status")).toHaveTextContent("목록이 바뀌어 처음부터 다시 불러왔습니다.");
    expect(screen.getByRole("heading", { name: "일정과 모임" })).toHaveFocus();
  });

  it("stretches the title link across the mobile row for a 44px+ tap target", () => {
    const css = readFileSync(path.resolve("features/host/ui/meeting-list/meeting-toc.css"), "utf8");
    expect(css).toMatch(/\.rm-meeting-toc__row\s*\{[^}]*position:\s*relative/s);
    expect(css).toMatch(/@media \(max-width: 640px\)[\s\S]*\.rm-meeting-toc__title::after[\s\S]*inset:\s*0/);
    expect(css).toMatch(/@media \(max-width: 640px\)[\s\S]*\.rm-meeting-toc__row[\s\S]*min-height:\s*62px/);
  });

  it("shows a past-section retry row without collapsing into the first-meeting empty state", async () => {
    const onRetryPast = vi.fn();
    renderList({
      sections: {
        upcoming: { rows: [upcomingRow], nextCursor: null },
        past: { rows: [], nextCursor: null },
      },
      pastErrorMessage: "지난 모임을 불러오지 못했습니다.",
      onRetryPast,
    });

    const past = screen.getByRole("region", { name: "지난 모임" });
    expect(within(past).getByText("지난 모임을 불러오지 못했습니다.")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "첫 모임 만들기" })).not.toBeInTheDocument();
    await userEvent.click(within(past).getByRole("button", { name: "다시 시도" }));
    expect(onRetryPast).toHaveBeenCalledOnce();
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

  it("switches to a calendar made only from loaded rows and discloses incomplete server pages", async () => {
    const user = userEvent.setup();
    renderList({
      sections: {
        upcoming: { rows: [upcomingRow], nextCursor: "opaque-upcoming" },
        past: { rows: [pastRow], nextCursor: "opaque-past" },
      },
    });

    await user.click(screen.getByRole("tab", { name: "달력" }));

    expect(screen.getByRole("tabpanel", { name: "달력" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "2026년 8월" })).toBeVisible();
    expect(screen.getByText("2026-08-30")).toBeVisible();
    expect(screen.getByRole("link", { name: "지구 끝의 온실" })).toHaveAttribute(
      "href",
      "/app/host/sessions/open-1",
    );
    expect(screen.getByText(/현재 불러온 모임만 표시/)).toBeVisible();
    expect(screen.getByRole("button", { name: "다가오는 모임 더 보기" })).toBeVisible();
    expect(screen.getByRole("button", { name: "지난 모임 더 보기" })).toBeVisible();
  });

  it("keeps loading, error, and empty states in list view instead of presenting an invented calendar", async () => {
    const user = userEvent.setup();
    renderList({
      sections: emptySections,
      errorMessage: "모임을 불러오지 못했습니다.",
      onRetry: vi.fn(),
    });

    await user.click(screen.getByRole("tab", { name: "달력" }));

    expect(screen.getByRole("alert")).toHaveTextContent("모임을 불러오지 못했습니다.");
    expect(screen.queryByText(/2026년/)).not.toBeInTheDocument();
  });

  it("keeps list browse on one heading, one create action, and an accessible view toggle", () => {
    renderList();

    const root = document.querySelector(".rm-meeting-toc") as HTMLElement | null;
    expect(root).not.toBeNull();
    expect(within(root!).getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(within(root!).getByRole("heading", { level: 1, name: "일정과 모임" })).toBeInTheDocument();
    expect(within(root!).getByRole("tablist", { name: "모임 보기 방식" })).toBeInTheDocument();
    expect(within(root!).getByRole("tab", { name: "목록" })).toHaveAttribute("aria-selected", "true");
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
    const upcoming = screen.getByRole("region", { name: "다가오는 모임" });
    expect(within(upcoming).getByRole("alert")).toHaveTextContent("모임을 불러오지 못했습니다.");
    expect(screen.getByRole("button", { name: "다시 시도" }).closest(".rm-meeting-toc")).not.toBeNull();
  });

  it("imports meeting TOC styles from the list module and keeps the route CSS entry", () => {
    const listSource = readFileSync(path.resolve("features/host/ui/meeting-list/host-meeting-list.tsx"), "utf8");
    const routeSource = readFileSync(path.resolve("features/host/route/host-meeting-list-route.tsx"), "utf8");
    expect(listSource).toContain("meeting-toc.css");
    expect(routeSource).toContain("host-editorial-ledger.css");
  });
});
