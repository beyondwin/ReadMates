import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { NotificationPreferences } from "@/features/archive/model/archive-model";
import { NotificationSettings } from "./notification-settings";

const preferences: NotificationPreferences = {
  emailEnabled: true,
  events: {
    NEXT_BOOK_PUBLISHED: true,
    SESSION_REMINDER_DUE: true,
    FEEDBACK_DOCUMENT_PUBLISHED: true,
    REVIEW_PUBLISHED: false,
  },
};

function renderSettings(onSave: (request: NotificationPreferences) => Promise<NotificationPreferences>) {
  return render(<NotificationSettings state={{ status: "ready", preferences }} onRetryLoad={() => undefined} onSave={onSave} />);
}

describe("NotificationSettings", () => {
  it("saves the edited notification payload", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockResolvedValue({ ...preferences, emailEnabled: false });
    renderSettings(onSave);

    await user.click(screen.getByRole("switch", { name: "이메일 알림" }));
    await user.click(screen.getByRole("button", { name: "알림 설정 저장" }));

    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith({
        emailEnabled: false,
        events: {
          NEXT_BOOK_PUBLISHED: true,
          SESSION_REMINDER_DUE: true,
          FEEDBACK_DOCUMENT_PUBLISHED: true,
          REVIEW_PUBLISHED: false,
        },
      }),
    );
  });

  it("blocks a second save while the first save is pending", async () => {
    const user = userEvent.setup();
    let resolveSave!: (value: NotificationPreferences) => void;
    const onSave = vi.fn().mockReturnValue(new Promise<NotificationPreferences>((resolve) => { resolveSave = resolve; }));
    renderSettings(onSave);

    await user.click(screen.getByRole("button", { name: "알림 설정 저장" }));
    await user.click(screen.getByRole("button", { name: "저장 중" }));

    expect(onSave).toHaveBeenCalledTimes(1);
    resolveSave(preferences);
  });

  it("retains the server-confirmed preferences after a save", async () => {
    const user = userEvent.setup();
    const saved = {
      ...preferences,
      emailEnabled: false,
      events: { ...preferences.events, REVIEW_PUBLISHED: true },
    };
    renderSettings(vi.fn().mockResolvedValue(saved));

    await user.click(screen.getByRole("switch", { name: "이메일 알림" }));
    await user.click(screen.getByRole("button", { name: "알림 설정 저장" }));

    await waitFor(() => expect(screen.getByRole("switch", { name: "이메일 알림" })).not.toBeChecked());
    expect(screen.getByRole("switch", { name: "다른 멤버의 서평 공개" })).toBeChecked();
  });

  it("keeps a rejected draft for a retry", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn()
      .mockRejectedValueOnce(new Error("temporary failure"))
      .mockResolvedValueOnce({ ...preferences, emailEnabled: false });
    renderSettings(onSave);

    await user.click(screen.getByRole("switch", { name: "이메일 알림" }));
    await user.click(screen.getByRole("button", { name: "알림 설정 저장" }));
    await expect(screen.findByRole("alert")).resolves.toHaveTextContent("알림 설정 저장에 실패했습니다.");
    expect(screen.getByRole("switch", { name: "이메일 알림" })).not.toBeChecked();

    await user.click(screen.getByRole("button", { name: "알림 설정 저장" }));
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(2));
    expect(onSave).toHaveBeenNthCalledWith(2, { ...preferences, emailEnabled: false });
  });
});
