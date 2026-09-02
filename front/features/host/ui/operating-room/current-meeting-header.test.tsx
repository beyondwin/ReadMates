import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CurrentMeetingHeader, type CurrentMeetingHeaderProps } from "./current-meeting-header";

const meeting: CurrentMeetingHeaderProps["meeting"] = {
  sessionId: "session-27",
  sessionNumber: 27,
  title: "지구 끝의 온실",
  bookTitle: "지구 끝의 온실",
  bookAuthor: "김초엽",
  bookImageUrl: null,
  date: "2026-09-01",
  startTime: "19:30",
  endTime: "21:30",
  locationLabel: "을지로 북살롱",
  lifecycle: "OPEN",
  lifecycleLabel: "준비 중",
  reverseLifecycleAction: null,
};

const links: CurrentMeetingHeaderProps["links"] = {
  infoHref: "/clubs/reading-sai/app/host/sessions/session-27?section=basic",
  scheduleHref: "/clubs/reading-sai/app/host/sessions/session-27?section=basic&edit=1",
  historyHref: "/clubs/reading-sai/app/host/sessions/session-27?section=history",
  memberViewHref: "/clubs/reading-sai/app/sessions/session-27",
};

describe("CurrentMeetingHeader", () => {
  it("keeps the selected meeting identity and all route-owned destinations discoverable", () => {
    render(<CurrentMeetingHeader meeting={meeting} dDayLabel="D-3" links={links} />);

    const header = screen.getByRole("group", { name: "현재 모임" });
    expect(header).toHaveAttribute("data-lifecycle", "OPEN");
    expect(within(header).getByRole("heading", { level: 1, name: "지구 끝의 온실" })).toBeVisible();
    expect(within(header).getByText("지구 끝의 온실 · 김초엽", { exact: true })).toBeVisible();
    expect(within(header).getByText("D-3")).toBeVisible();
    expect(within(header).getByText("준비 중")).toBeVisible();
    expect(within(header).getByText("2026.09.01")).toHaveAttribute("datetime", "2026-09-01");
    expect(within(header).getByText("19:30–21:30")).toBeVisible();
    expect(within(header).getByText("을지로 북살롱")).toBeVisible();

    const actions = within(header).getByRole("navigation", { name: "현재 모임 작업" });
    expect(within(actions).getByRole("link", { name: "모임 정보" })).toHaveAttribute("href", links.infoHref);
    expect(within(actions).getByRole("link", { name: "일정 편집" })).toHaveAttribute("href", links.scheduleHref);
    expect(within(actions).getByRole("link", { name: "변경 이력" })).toHaveAttribute("href", links.historyHref);
    expect(within(actions).getByRole("link", { name: "멤버 시야" })).toHaveAttribute("href", links.memberViewHref);
    expect(actions.querySelector("svg[data-icon='info']")).not.toBeNull();
    expect(actions.querySelector("svg[data-icon='edit']")).not.toBeNull();
    expect(actions.querySelector("svg[data-icon='history']")).not.toBeNull();
    expect(actions.querySelector("svg[data-icon='eye']")).not.toBeNull();
    const cover = header.querySelector(".rm-operating-room-header__cover .rm-book-cover");
    expect(cover).not.toBeNull();
    expect(cover?.querySelector(".rm-book-cover__fallback")).not.toBeNull();
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
        dDayLabel={null}
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
