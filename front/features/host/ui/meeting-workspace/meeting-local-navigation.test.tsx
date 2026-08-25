import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MeetingLocalNavigation } from "./meeting-local-navigation";

const tasks = [
  { task: "overview" as const, label: "개요", href: "?section=overview" },
  { task: "responses" as const, label: "참석 응답", href: "?section=responses", badge: "미응답 5" },
  { task: "attendance" as const, label: "실제 출석", href: "?section=attendance" },
  { task: "records" as const, label: "모임 기록", href: "?section=records" },
  { task: "notifications" as const, label: "알림", href: "?section=notifications" },
  { task: "history" as const, label: "변경 내역", href: "?section=history" },
];

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

describe("MeetingLocalNavigation", () => {
  beforeEach(() => {
    vi.stubGlobal("ResizeObserver", ResizeObserverStub);
    vi.stubGlobal("matchMedia", vi.fn().mockImplementation((query: string) => ({
      matches: query.includes("767") && window.innerWidth <= 767,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })));
  });

  it("renders canonical task links in a named nav without tab or stepper semantics", () => {
    render(<MeetingLocalNavigation tasks={tasks} activeTask="attendance" onTaskLinkActivated={vi.fn()} />);

    const nav = screen.getByRole("navigation", { name: "현재 모임 작업" });
    expect(nav).toBeVisible();
    expect(screen.getByRole("link", { name: "실제 출석" })).toHaveAttribute("href", "?section=attendance");
    expect(screen.getByRole("link", { name: "실제 출석" })).toHaveAttribute("aria-current", "page");
    expect(screen.queryByRole("tablist")).not.toBeInTheDocument();
    expect(screen.queryByText(/\d+\/\d+ 완료/)).not.toBeInTheDocument();
  });

  it("uses a modal mobile sheet, traps focus, closes on Escape, and restores its trigger", async () => {
    window.innerWidth = 390;
    const user = userEvent.setup();
    render(<MeetingLocalNavigation tasks={tasks} activeTask="overview" onTaskLinkActivated={vi.fn()} />);

    const trigger = screen.getByRole("button", { name: "모임 작업 목차" });
    await user.click(trigger);
    const sheet = screen.getByRole("dialog", { name: "모임 작업 목차" });
    expect(sheet).toHaveAttribute("aria-modal", "true");
    expect(sheet).toContainElement(document.activeElement as HTMLElement);

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog", { name: "모임 작업 목차" })).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it("falls back to an anchored non-modal popover when tablet labels overflow", () => {
    window.innerWidth = 768;
    render(<MeetingLocalNavigation tasks={tasks} activeTask="overview" onTaskLinkActivated={vi.fn()} />);
    const strip = screen.getByTestId("meeting-task-strip");
    Object.defineProperties(strip, {
      clientWidth: { configurable: true, value: 360 },
      scrollWidth: { configurable: true, value: 800 },
    });
    act(() => fireEvent(window, new Event("resize")));

    fireEvent.click(screen.getByRole("button", { name: "모임 작업 목차" }));
    const popover = screen.getByRole("region", { name: "모임 작업 목차" });
    expect(popover).not.toHaveAttribute("aria-modal");
    expect(popover).toContainElement(screen.getByRole("navigation", { name: "모임 작업 목차" }));
  });
});
