import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { NotificationPreferences } from "../model/notification-preferences-model";
import { MemberNotificationSettingsRoute } from "./member-notification-settings-route";

const route = vi.hoisted(() => ({
  loaderData: null as unknown,
  revalidate: vi.fn(),
}));
const api = vi.hoisted(() => ({
  saveNotificationPreferences: vi.fn(),
}));

vi.mock("react-router-dom", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react-router-dom")>()),
  useLoaderData: () => route.loaderData,
  useRevalidator: () => ({ revalidate: route.revalidate }),
}));
vi.mock("../api/notification-preferences-api", () => api);

const preferences: NotificationPreferences = {
  emailEnabled: true,
  events: {
    NEXT_BOOK_PUBLISHED: true,
    SESSION_REMINDER_DUE: true,
    FEEDBACK_DOCUMENT_PUBLISHED: true,
    REVIEW_PUBLISHED: false,
  },
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });
  return { promise, resolve, reject };
}

function renderRoute() {
  return render(
    <MemoryRouter initialEntries={["/clubs/reading-sai/app/notifications/settings"]}>
      <MemberNotificationSettingsRoute />
    </MemoryRouter>,
  );
}

describe("MemberNotificationSettingsRoute", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    route.loaderData = { status: "ready", preferences };
  });

  afterEach(cleanup);

  it("saves once, blocks pending controls, and synchronizes the returned server state", async () => {
    const user = userEvent.setup();
    const save = deferred<NotificationPreferences>();
    const serverPreferences: NotificationPreferences = {
      emailEnabled: true,
      events: { ...preferences.events, REVIEW_PUBLISHED: true },
    };
    api.saveNotificationPreferences.mockReturnValue(save.promise);
    renderRoute();

    await user.click(screen.getByRole("switch", { name: "이메일 알림" }));
    await user.click(screen.getByRole("button", { name: "알림 설정 저장" }));

    expect(api.saveNotificationPreferences).toHaveBeenCalledOnce();
    expect(api.saveNotificationPreferences).toHaveBeenCalledWith({
      ...preferences,
      emailEnabled: false,
    });
    expect(screen.getByRole("button", { name: "저장 중" })).toBeDisabled();
    for (const control of screen.getAllByRole("switch")) {
      expect(control).toBeDisabled();
    }

    await act(async () => {
      save.resolve(serverPreferences);
      await save.promise;
    });

    await waitFor(() => {
      expect(screen.getByRole("switch", { name: "이메일 알림" })).toBeChecked();
    });
    expect(screen.getByRole("switch", { name: "다른 멤버의 서평 공개" })).toBeChecked();
  });

  it("preserves a rejected draft and allows an explicit retry", async () => {
    const user = userEvent.setup();
    api.saveNotificationPreferences
      .mockRejectedValueOnce(new Error("temporary failure"))
      .mockResolvedValueOnce({ ...preferences, emailEnabled: false });
    renderRoute();

    await user.click(screen.getByRole("switch", { name: "이메일 알림" }));
    await user.click(screen.getByRole("button", { name: "알림 설정 저장" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("알림 설정 저장에 실패했습니다.");
    expect(screen.getByRole("switch", { name: "이메일 알림" })).not.toBeChecked();

    await user.click(screen.getByRole("button", { name: "알림 설정 저장" }));
    await waitFor(() => expect(api.saveNotificationPreferences).toHaveBeenCalledTimes(2));
    expect(api.saveNotificationPreferences).toHaveBeenLastCalledWith({
      ...preferences,
      emailEnabled: false,
    });
  });

  it("retries only the settings loader after a contained GET failure", async () => {
    const user = userEvent.setup();
    route.loaderData = { status: "error" };
    renderRoute();

    await user.click(screen.getByRole("button", { name: "다시 시도" }));

    expect(route.revalidate).toHaveBeenCalledOnce();
    expect(api.saveNotificationPreferences).not.toHaveBeenCalled();
  });
});
