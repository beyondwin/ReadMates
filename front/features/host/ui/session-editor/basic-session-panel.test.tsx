import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { BasicSessionPanel } from "./basic-session-panel";

describe("BasicSessionPanel", () => {
  it("renders book and schedule headings without tabpanel semantics", () => {
    render(
      <BasicSessionPanel
        title="7회차 모임"
        bookTitle="테스트 책"
        bookAuthor="테스트 저자"
        bookLink=""
        bookImageUrl=""
        date="2026-08-21"
        time="20:00"
        deadline="08-20 23:59까지"
        locationLabel="온라인"
        meetingUrl=""
        meetingPasscode=""
        onTitleChange={vi.fn()}
        onBookTitleChange={vi.fn()}
        onBookAuthorChange={vi.fn()}
        onBookLinkChange={vi.fn()}
        onBookImageUrlChange={vi.fn()}
        onDateChange={vi.fn()}
        onTimeChange={vi.fn()}
        onLocationLabelChange={vi.fn()}
        onMeetingUrlChange={vi.fn()}
        onMeetingPasscodeChange={vi.fn()}
      />,
    );

    expect(screen.getByRole("heading", { name: "읽을 책" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "모임 일정과 접속 정보" })).toBeVisible();
    expect(screen.queryByRole("tabpanel")).not.toBeInTheDocument();
    expect(screen.getByLabelText("세션 제목")).toHaveValue("7회차 모임");
  });
});
