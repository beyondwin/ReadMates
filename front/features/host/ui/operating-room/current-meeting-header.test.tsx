import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CurrentMeetingHeader, type CurrentMeetingHeaderProps } from "./current-meeting-header";

const meeting: CurrentMeetingHeaderProps["meeting"] = {
  sessionId: "session-27",
  sessionNumber: 27,
  title: "스물여덟 번째 모임",
  bookTitle: "지구 끝의 온실",
  bookAuthor: "김초엽",
  bookImageUrl: "/covers/x.webp",
  date: "2026-09-01",
  startTime: "19:30",
  endTime: "21:30",
  locationLabel: "을지로 북살롱",
  lifecycle: "OPEN",
  lifecycleLabel: "준비 중",
  reverseLifecycleAction: null,
};

const links: CurrentMeetingHeaderProps["links"] = {
  infoHref: "/i",
  scheduleHref: "/s",
  historyHref: "/h",
  previewHref: null,
};

describe("CurrentMeetingHeader", () => {
  it("uses the book title as h1, meeting title as kicker, icon facts, and three actions without member view", () => {
    render(
      <CurrentMeetingHeader
        meeting={meeting}
        badge={{ kind: "dday", label: "D-3" }}
        links={links}
      />,
    );

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("지구 끝의 온실");
    expect(screen.getByText(/스물여덟 번째 모임/)).toBeTruthy();
    expect(screen.getByRole("img", { name: /지구 끝의 온실/ })).toBeTruthy();
    expect(screen.getByRole("list", { name: "모임 일정과 장소" }).querySelectorAll("[data-icon]")).toHaveLength(3);
    const actions = within(screen.getByRole("navigation", { name: "현재 모임 작업" })).getAllByRole("link");
    expect(actions.map((a) => a.textContent)).toEqual(["모임 정보", "일정 편집", "변경 이력"]);
    expect(screen.getByText("D-3")).toBeTruthy();
    expect(screen.getByText("9월 1일 화요일")).toHaveAttribute("datetime", "2026-09-01");
    expect(screen.getByText("오후 7:30")).toBeTruthy();
    expect(screen.queryByText(/21:30/)).not.toBeInTheDocument();
    expect(screen.queryByText("준비 중")).not.toBeInTheDocument();
    expect(within(screen.getByRole("navigation", { name: "현재 모임 작업" })).queryByRole("link", { name: "멤버 시야" })).not.toBeInTheDocument();
  });

  it("shows 기록 미리보기 when previewHref is given", () => {
    render(
      <CurrentMeetingHeader
        meeting={meeting}
        badge={{ kind: "dday", label: "D+1" }}
        links={{ ...links, previewHref: "/p" }}
      />,
    );

    const actions = within(screen.getByRole("navigation", { name: "현재 모임 작업" })).getAllByRole("link");
    expect(actions.map((a) => a.textContent)).toEqual(["모임 정보", "기록 미리보기", "변경 이력"]);
    expect(actions[1]).toHaveAttribute("href", "/p");
    expect(actions[1].querySelector("[data-icon='document']")).not.toBeNull();
  });

  it("places optional member view outside desktop actions", () => {
    render(
      <CurrentMeetingHeader
        meeting={meeting}
        badge={{ kind: "live", label: "진행 중" }}
        links={{ ...links, memberViewHref: "/m" }}
      />,
    );

    const memberView = screen.getByRole("link", { name: "멤버 시야" });
    expect(memberView).toHaveClass("rm-operating-room-header__member-view");
    expect(memberView).toHaveAttribute("href", "/m");
    expect(memberView.querySelector("[data-icon='eye']")).not.toBeNull();
    expect(screen.getByText("진행 중").closest("[data-badge]")).toHaveAttribute("data-badge", "live");
    expect(within(screen.getByRole("navigation", { name: "현재 모임 작업" })).queryByRole("link", { name: "멤버 시야" })).not.toBeInTheDocument();
  });

  it("renders the established cover fallback and explicit labels for partial meeting fields", () => {
    render(
      <CurrentMeetingHeader
        meeting={{
          ...meeting,
          title: "  ",
          bookTitle: "",
          bookAuthor: "",
          bookImageUrl: "javascript:unsafe",
          date: "",
          startTime: "",
          endTime: "",
          locationLabel: "",
        }}
        badge={null}
        links={links}
      />,
    );

    expect(screen.getByRole("heading", { level: 1, name: "모임 제목 미정" })).toBeVisible();
    const fallback = document.querySelector(".rm-book-cover__fallback");
    expect(fallback).not.toBeNull();
    expect(within(fallback as HTMLElement).getByText("도서 제목 미정")).toBeVisible();
    expect(within(fallback as HTMLElement).getByText("저자 미상")).toBeVisible();
    expect(fallback?.parentElement?.querySelector("img")).toBeNull();
    expect(screen.getByText("날짜 미정")).toBeVisible();
    expect(screen.getByText("시간 미정")).toBeVisible();
    expect(screen.getByText("장소 미정")).toBeVisible();
    expect(screen.queryByText(/^D[-+]/)).not.toBeInTheDocument();
  });
});
