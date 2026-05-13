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
});
