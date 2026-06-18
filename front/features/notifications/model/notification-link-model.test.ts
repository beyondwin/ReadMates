import { describe, expect, it } from "vitest";
import { getMemberNotificationLinkView } from "./notification-link-model";

describe("getMemberNotificationLinkView", () => {
  it("maps session deep links to member reflection action", () => {
    const view = getMemberNotificationLinkView("/sessions/11111111-1111-1111-1111-111111111111");

    expect(view.href).toBe("/app/sessions/11111111-1111-1111-1111-111111111111");
    expect(view.primaryActionLabel).toBe("View record");
    expect(view.reflectionLabel).toBe("Past session reflection");
  });

  it("maps feedback document index safely", () => {
    const view = getMemberNotificationLinkView("/feedback-documents");

    expect(view.href).toBe("/app/archive?view=report");
    expect(view.primaryActionLabel).toBe("View feedback");
  });

  it("falls back for unsafe deep links", () => {
    expect(getMemberNotificationLinkView("//evil.example.com").href).toBe("/app/notifications");
    expect(getMemberNotificationLinkView("https://evil.example.com").href).toBe("/app/notifications");
  });
});
