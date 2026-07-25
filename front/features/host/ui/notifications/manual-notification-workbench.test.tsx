import { render, screen, within } from "@testing-library/react";
import type { ComponentProps } from "react";
import { describe, expect, it, vi } from "vitest";
import type {
  HostSessionListItem,
  ManualNotificationOptionsResponse,
} from "@/features/host/model/host-view-types";
import { ManualNotificationWorkbench } from "./manual-notification-workbench";

const contentRevision = "a".repeat(64);

const options: ManualNotificationOptionsResponse = {
  session: {
    sessionId: "session-9",
    sessionNumber: 9,
    bookTitle: "Example Book",
    date: "2026-07-15",
    state: "OPEN",
    visibility: "MEMBER",
    feedbackDocumentUploaded: false,
  },
  templates: [
    {
      eventType: "SESSION_REMINDER_DUE",
      contentRevision,
      label: "모임 전날 리마인더",
      enabled: true,
      disabledReason: null,
      defaultAudience: "ALL_ACTIVE_MEMBERS",
      allowedAudiences: ["ALL_ACTIVE_MEMBERS", "SESSION_PARTICIPANTS"],
      defaultChannels: "BOTH",
    },
    {
      eventType: "FEEDBACK_DOCUMENT_PUBLISHED",
      contentRevision,
      label: "피드백 문서 등록",
      enabled: false,
      disabledReason: "피드백 문서가 등록된 뒤 발송할 수 있습니다.",
      defaultAudience: "CONFIRMED_ATTENDEES",
      allowedAudiences: ["CONFIRMED_ATTENDEES"],
      defaultChannels: "BOTH",
    },
  ],
  members: { items: [], nextCursor: null },
  recentDispatches: [],
};

const sessions: HostSessionListItem[] = [{
  sessionId: "session-9",
  sessionNumber: 9,
  title: "9회차 모임",
  bookTitle: "Example Book",
  bookAuthor: "Example Author",
  bookImageUrl: null,
  date: "2026-07-15",
  startTime: "20:00",
  endTime: "22:00",
  locationLabel: "온라인",
  state: "OPEN",
  visibility: "MEMBER",
}];

type WorkbenchProps = ComponentProps<typeof ManualNotificationWorkbench>;

function renderWorkbench(overrides: Partial<WorkbenchProps> = {}) {
  const props: WorkbenchProps = {
    options,
    hostSessions: sessions,
    initialSessionId: "session-9",
    initialEventType: "SESSION_REMINDER_DUE",
    preview: null,
    busy: false,
    error: null,
    onPreview: vi.fn().mockResolvedValue(undefined),
    onConfirm: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
  return render(<ManualNotificationWorkbench {...props} />);
}

describe("ManualNotificationWorkbench", () => {
  it("renders the three sending decisions in order", () => {
    renderWorkbench();

    const workbench = screen.getByRole("region", { name: "새 알림 발송" });
    const labels = within(workbench)
      .getAllByText(/0[123] ·/)
      .map((node) => node.textContent);

    expect(labels).toEqual([
      "01 · 대상 회차",
      "02 · 알림 종류",
      "03 · 대상과 채널",
    ]);
    expect(within(workbench).getByRole("button", { name: "미리보기 열기" })).toBeEnabled();
    expect(within(workbench).queryByRole("heading", { name: "멤버에게 알림을 보낼까요?" })).not.toBeInTheDocument();
  });

  it("shows why an unavailable template cannot be selected", () => {
    renderWorkbench();

    const unavailable = screen.getByRole("button", { name: "피드백 문서 등록" });
    const reason = screen.getByText("피드백 문서가 등록된 뒤 발송할 수 있습니다.");
    expect(unavailable).toBeDisabled();
    expect(unavailable).toHaveAttribute("aria-describedby", reason.id);
  });
});
