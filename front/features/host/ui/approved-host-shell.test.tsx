import { render, screen } from "@testing-library/react";
import { beforeAll, describe, expect, it } from "vitest";
import { HostApprovedShell } from "./approved-host-shell";

beforeAll(() => {
  const stylesheet = document.createElement("style");
  stylesheet.textContent = ".desktop-only{display:block}.mobile-only{display:none}";
  document.head.append(stylesheet);
});

describe("HostApprovedShell", () => {
  it("marks people current and operating-room not current", () => {
    render(
      <HostApprovedShell destination="people">
        <main><h1>사람</h1></main>
      </HostApprovedShell>,
    );
    expect(screen.getByRole("link", { name: "사람" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "운영실" })).not.toHaveAttribute("aria-current");
  });

  it("marks 초대와 설정 current for settings destination", () => {
    render(
      <HostApprovedShell destination="settings">
        <main><h1>초대와 설정</h1></main>
      </HostApprovedShell>,
    );
    expect(screen.getByRole("link", { name: "초대와 설정" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "운영실" })).not.toHaveAttribute("aria-current");
  });

  it("marks people current for person-detail", () => {
    render(
      <HostApprovedShell destination="person-detail">
        <main><h1>사람 상세</h1></main>
      </HostApprovedShell>,
    );
    expect(screen.getByRole("link", { name: "사람" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "운영실" })).not.toHaveAttribute("aria-current");
  });

  it("marks operating-room current for schedule-review", () => {
    render(
      <HostApprovedShell destination="schedule-review">
        <main><h1>일정 검토</h1></main>
      </HostApprovedShell>,
    );
    expect(screen.getByRole("link", { name: "운영실" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "사람" })).not.toHaveAttribute("aria-current");
  });

  it("includes desktop primary nav, mobile bottom nav, and a book-club account chip", () => {
    render(
      <HostApprovedShell destination="operating-room">
        <main><h1>운영실</h1></main>
      </HostApprovedShell>,
    );
    expect(screen.getByRole("navigation", { name: "호스트 주 메뉴" })).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "호스트 주 메뉴 모바일", hidden: true })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "계정 메뉴" }).querySelector("img"))
      .toHaveAttribute("src", "/assets/avatars/book-club/mushroom-green-book.webp");
  });
});
