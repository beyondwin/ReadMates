import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MemoryRouter } from "react-router";
import {
  AdminAlarmBar,
  type AdminAlarmSummary,
} from "./admin-alarm-bar";

const attentionSummary: AdminAlarmSummary = {
  attention: { count: 1, headline: "밤의 독서회 알림 실패" },
  unacknowledged: 0,
  serviceState: "ok",
  asOf: "2026-08-04T12:36:00Z",
};

const quietSummary: AdminAlarmSummary = {
  attention: { count: 0, headline: null },
  unacknowledged: 0,
  serviceState: "ok",
  asOf: "2026-08-04T12:36:00Z",
};

function renderBar(
  props: { summary: AdminAlarmSummary | null; state: "ready" | "loading" | "unavailable" },
) {
  return render(
    <MemoryRouter>
      <AdminAlarmBar {...props} />
    </MemoryRouter>,
  );
}

function todayLink() {
  return screen.getByRole("link", { name: "오늘 열기" });
}

describe("AdminAlarmBar", () => {
  it("renders warn text, the representative headline, and as-of when attention is 1", () => {
    const { container } = renderBar({ summary: attentionSummary, state: "ready" });

    expect(container.querySelector(".admin-alarm-bar__live")).toHaveTextContent(
      "주의 1건 — 밤의 독서회 알림 실패",
    );
    expect(screen.getByText("미확인 신호 없음 · 서비스 정상")).toBeInTheDocument();
    expect(container.querySelector(".admin-alarm-bar__asof")).toHaveTextContent(
      "21:36 기준",
    );
    expect(todayLink()).toHaveAttribute("href", "/admin/today");
  });

  it("renders an achromatic quiet line when there are 0 attention cases", () => {
    const { container } = renderBar({ summary: quietSummary, state: "ready" });

    expect(container.querySelector(".admin-alarm-bar__live")).toBeNull();
    expect(screen.getByText("미확인 신호 없음 · 서비스 정상")).toBeInTheDocument();
    expect(container.querySelector(".admin-alarm-bar")).not.toHaveAttribute(
      "role",
      "status",
    );
    expect(todayLink()).toHaveAttribute("href", "/admin/today");
  });

  it("announces unavailability with role=status and no warn color", () => {
    const { container } = renderBar({ summary: null, state: "unavailable" });

    expect(screen.getByRole("status")).toHaveTextContent("신호 확인 불가");
    expect(container.querySelector(".admin-alarm-bar__live")).toBeNull();
    expect(todayLink()).toHaveAttribute("href", "/admin/today");
  });

  it.each([
    { summary: attentionSummary, state: "ready" as const },
    { summary: quietSummary, state: "ready" as const },
    { summary: null, state: "loading" as const },
    { summary: null, state: "unavailable" as const },
  ])("keeps 오늘 열기 pointing at /admin/today when state is $state", (props) => {
    renderBar(props);
    expect(todayLink()).toHaveAttribute("href", "/admin/today");
  });
});
