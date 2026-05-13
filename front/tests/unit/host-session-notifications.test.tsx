import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { HostSessionNotificationActions } from "@/features/host/ui/session-editor/session-editor-notifications";

describe("HostSessionNotificationActions", () => {
  it("links available templates to the manual notification workbench", () => {
    render(
      <HostSessionNotificationActions
        sessionId="session-1"
        state="OPEN"
        visibility="MEMBER"
        feedbackDocumentUploaded
      />,
    );

    expect(screen.getByRole("link", { name: "모임 전날 리마인더" })).toHaveAttribute(
      "href",
      "/app/host/notifications?sessionId=session-1&eventType=SESSION_REMINDER_DUE",
    );
    expect(screen.getByRole("link", { name: "피드백 문서 등록" })).toHaveAttribute(
      "href",
      "/app/host/notifications?sessionId=session-1&eventType=FEEDBACK_DOCUMENT_PUBLISHED",
    );
  });

  it("disables feedback notification when feedback document is missing", () => {
    render(
      <HostSessionNotificationActions
        sessionId="session-1"
        state="OPEN"
        visibility="MEMBER"
        feedbackDocumentUploaded={false}
      />,
    );

    expect(screen.getByRole("button", { name: /피드백 문서 등록/ })).toBeDisabled();
  });

  it("marks sent templates and links resend review to host notifications", () => {
    render(
      <HostSessionNotificationActions
        sessionId="session-1"
        state="OPEN"
        visibility="MEMBER"
        feedbackDocumentUploaded
        dispatches={[
          {
            manualDispatchId: "dispatch-1",
            eventId: "event-1",
            source: "MANUAL",
            eventType: "SESSION_REMINDER_DUE",
            sessionId: "session-1",
            sessionNumber: 8,
            bookTitle: "Example Book",
            requestedChannels: "BOTH",
            audience: "ALL_ACTIVE_MEMBERS",
            resend: false,
            requestedBy: "h***@example.com",
            targetCount: 17,
            expectedInAppCount: 17,
            expectedEmailCount: 14,
            eventStatus: "PUBLISHED",
            createdAt: "2026-05-13T10:10:00Z",
          },
        ]}
      />,
    );

    expect(screen.getByText("이미 발송됨")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /재발송 검토/ })).toHaveAttribute(
      "href",
      expect.stringContaining("eventType=SESSION_REMINDER_DUE"),
    );
  });
});
