import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { buildHostMeetingWorkspace } from "@/features/host/model/host-session-workspace-model";
import { MeetingFocusFacts } from "./meeting-focus-facts";

const openFacts = buildHostMeetingWorkspace({
  currentUrl: "https://readmates.test/clubs/alpha/app/host/sessions/session-7",
  state: "OPEN",
  meetingDate: "2026-08-28",
  today: "2026-08-21",
  unansweredResponseCount: 5,
  unknownAttendanceCount: 2,
  recordReadiness: { status: "not-required" },
}).facts;

describe("MeetingFocusFacts", () => {
  it("renders 3-5 actual-state sentences instead of badges or a stepper", () => {
    render(<MeetingFocusFacts facts={openFacts} />);

    const region = screen.getByRole("region", { name: "진행 목록" });
    const items = within(region).getAllByRole("listitem");
    expect(items.length).toBeGreaterThanOrEqual(3);
    expect(items.length).toBeLessThanOrEqual(5);
    expect(within(region).getByText("모임일은 2026-08-28입니다.")).toBeVisible();
    expect(within(region).getByText("참석 응답이 없는 멤버가 5명입니다.")).toBeVisible();
    expect(within(region).getByText("실제 출석이 확인되지 않은 멤버가 2명입니다.")).toBeVisible();
    expect(within(region).queryByText("미응답 5")).not.toBeInTheDocument();
    expect(within(region).queryByText("확인 필요")).not.toBeInTheDocument();
    expect(within(region).queryByText(/완료율|퍼센트|진행 중|대기/)).not.toBeInTheDocument();
    expect(screen.queryByRole("list", { name: "진행 상황" })).not.toBeInTheDocument();
  });

  it("rehomes judgment projections as audience and public facts", () => {
    render(
      <MeetingFocusFacts
        facts={openFacts}
        projections={[
          { audience: "호스트", result: "운영 기록과 초안 계속 편집" },
          { audience: "게스트·멤버", result: "허용된 아카이브에서 읽음" },
          { audience: "공개 기록", result: "공개 기록에 게시 안 됨" },
        ]}
      />,
    );

    const region = screen.getByRole("region", { name: "진행 목록" });
    expect(within(region).getByText("호스트")).toBeVisible();
    expect(within(region).getByText("운영 기록과 초안 계속 편집")).toBeVisible();
    expect(within(region).getByText("게스트·멤버")).toBeVisible();
    expect(within(region).getByText("허용된 아카이브에서 읽음")).toBeVisible();
    expect(within(region).getByText("공개 기록")).toBeVisible();
    expect(within(region).getByText("공개 기록에 게시 안 됨")).toBeVisible();
  });

  it("shows stale record retry on the facts surface", async () => {
    const onRetryReadiness = vi.fn();
    const user = userEvent.setup();
    render(
      <MeetingFocusFacts
        facts={[{ id: "record", label: "모임 기록이 최신이 아닙니다.", tone: "attention", relatedTask: "records" }]}
        recordReadiness={{
          status: "stale",
          observedAt: "2026-08-25T01:02:03.000Z",
          retryable: true,
          facts: {
            hasDraft: false,
            draftLiveBaseStale: false,
            validationIssueCount: 0,
            hasAppliedRecord: false,
            publicationReady: false,
          },
        }}
        onRetryReadiness={onRetryReadiness}
      />,
    );

    expect(screen.getByRole("status")).toHaveTextContent("확인한 내용");
    await user.click(screen.getByRole("button", { name: "최신 내용 확인" }));
    expect(onRetryReadiness).toHaveBeenCalledTimes(1);
  });

  it("shows unavailable record retry without inventing an upload action", async () => {
    const onRetryReadiness = vi.fn();
    const user = userEvent.setup();
    render(
      <MeetingFocusFacts
        facts={[{ id: "record", label: "모임 기록을 확인하지 못했습니다.", tone: "attention", relatedTask: "records" }]}
        recordReadiness={{ status: "unavailable", observedAt: null, retryable: true }}
        onRetryReadiness={onRetryReadiness}
      />,
    );

    expect(screen.getByRole("alert")).toHaveTextContent("모임 기록을 확인하지 못했습니다");
    await user.click(screen.getByRole("button", { name: "모임 기록 다시 시도" }));
    expect(onRetryReadiness).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("정리본 올리기")).not.toBeInTheDocument();
  });
});
