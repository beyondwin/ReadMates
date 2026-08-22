import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AdminStatePanel, type AdminPageState } from "./admin-state-panel";

const ALL_STATES: AdminPageState[] = [
  "loading",
  "empty",
  "partial",
  "unavailable",
  "forbidden",
  "ready",
];

describe("AdminStatePanel", () => {
  it("exposes the six page states used by the workspace grammar", () => {
    expect(ALL_STATES).toEqual(["loading", "empty", "partial", "unavailable", "forbidden", "ready"]);
  });

  it("announces loading through a single status region without a duplicate aria-live", () => {
    render(<AdminStatePanel state="loading" />);

    const status = screen.getByRole("status");
    expect(status).toHaveTextContent("불러오는 중");
    expect(status).not.toHaveAttribute("aria-live");
    expect(screen.getAllByRole("status")).toHaveLength(1);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("renders empty copy without treating absence as a failure alert", () => {
    render(<AdminStatePanel state="empty" />);

    expect(screen.getByText("표시할 항목이 없습니다")).toBeInTheDocument();
    expect(screen.getByText("지금은 확인할 내용이 없습니다.")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("keeps ready children quiet so they are not re-announced", () => {
    render(
      <AdminStatePanel state="ready">
        <p>준비된 작업 목록</p>
      </AdminStatePanel>,
    );

    expect(screen.getByText("준비된 작업 목록")).toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("discloses a failed secondary source without blanking successful content", () => {
    render(
      <AdminStatePanel
        state="partial"
        sources={[
          { id: "cases", label: "운영 사건", available: true },
          { id: "health", label: "서비스 건강", available: false },
        ]}
      >
        <p>정상 큐</p>
      </AdminStatePanel>,
    );

    const notice = screen.getByRole("status");
    expect(notice).not.toHaveAttribute("aria-live");
    expect(notice).toHaveTextContent("일부만 확인됨");
    expect(notice).toHaveTextContent("실패한 원천은 아래에 표시합니다. 확인된 내용은 그대로 사용할 수 있습니다.");
    expect(within(notice).getByText("서비스 건강")).toBeInTheDocument();
    expect(within(notice).getByText("확인 불가")).toBeInTheDocument();
    expect(within(notice).getByText("운영 사건")).toBeInTheDocument();
    expect(screen.getByText("정상 큐")).toBeInTheDocument();
    expect(screen.getByText("정상 큐").closest("[role='status']")).toBeNull();
    expect(screen.getAllByRole("status")).toHaveLength(1);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("uses an alert for blocking unavailable and forbidden states", () => {
    const { rerender } = render(<AdminStatePanel state="unavailable" />);
    const unavailable = screen.getByRole("alert");
    expect(unavailable).toHaveTextContent("지금은 확인할 수 없습니다");
    expect(unavailable).not.toHaveAttribute("aria-live");
    expect(screen.queryByRole("status")).not.toBeInTheDocument();

    rerender(<AdminStatePanel state="forbidden" />);
    const forbidden = screen.getByRole("alert");
    expect(forbidden).toHaveTextContent("권한이 없습니다");
    expect(forbidden).toHaveTextContent("이 화면을 볼 권한이 없습니다.");
    expect(forbidden).not.toHaveAttribute("aria-live");
  });

  it("prefers slot copy over default strings", () => {
    render(
      <AdminStatePanel
        state="empty"
        title="필터와 맞는 사건이 없습니다"
        description="필터를 지우면 전체 큐를 다시 볼 수 있습니다."
        action={<button type="button">필터 지우기</button>}
      />,
    );

    expect(screen.getByText("필터와 맞는 사건이 없습니다")).toBeInTheDocument();
    expect(screen.getByText("필터를 지우면 전체 큐를 다시 볼 수 있습니다.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "필터 지우기" })).toBeInTheDocument();
    expect(screen.queryByText("표시할 항목이 없습니다")).not.toBeInTheDocument();
  });
});
