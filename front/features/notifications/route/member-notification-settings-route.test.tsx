import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  createMemoryRouter, MemoryRouter } from "react-router";
import { RouterProvider } from "react-router/dom";
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

vi.mock("react-router", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react-router")>()),
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

function renderNavigableRoute() {
  const router = createMemoryRouter(
    [
      {
        path: "/clubs/:clubSlug/app/notifications/settings",
        element: <MemberNotificationSettingsRoute />,
      },
    ],
    { initialEntries: ["/clubs/reading-sai/app/notifications/settings"] },
  );

  return { ...render(<RouterProvider router={router} />), router };
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

  it("saves the current club while the prior club save remains unresolved", async () => {
    const user = userEvent.setup();
    const staleSave = deferred<NotificationPreferences>();
    const currentSave = deferred<NotificationPreferences>();
    const secondClubPreferences: NotificationPreferences = {
      ...preferences,
      events: { ...preferences.events, REVIEW_PUBLISHED: false },
    };
    api.saveNotificationPreferences
      .mockReturnValueOnce(staleSave.promise)
      .mockReturnValueOnce(currentSave.promise);
    const { router } = renderNavigableRoute();

    await user.click(screen.getByRole("switch", { name: "이메일 알림" }));
    await user.click(screen.getByRole("button", { name: "알림 설정 저장" }));
    expect(screen.getByRole("button", { name: "저장 중" })).toBeDisabled();

    route.loaderData = {
      status: "ready",
      preferences: secondClubPreferences,
    };
    await act(async () => {
      await router.navigate("/clubs/reading-gathering/app/notifications/settings");
    });

    expect(screen.getByRole("button", { name: "알림 설정 저장" })).toBeEnabled();
    await user.click(screen.getByRole("switch", { name: "다른 멤버의 서평 공개" }));
    await user.click(screen.getByRole("button", { name: "알림 설정 저장" }));
    await waitFor(() => {
      expect(api.saveNotificationPreferences).toHaveBeenCalledTimes(2);
    });
    expect(api.saveNotificationPreferences).toHaveBeenLastCalledWith({
      ...secondClubPreferences,
      events: {
        ...secondClubPreferences.events,
        REVIEW_PUBLISHED: true,
      },
    });

    await act(async () => {
      staleSave.reject(new Error("club A save failed late"));
      await staleSave.promise.catch(() => undefined);
    });
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByRole("button", { name: "저장 중" })).toBeDisabled();

    await act(async () => {
      currentSave.resolve({
        ...secondClubPreferences,
        emailEnabled: false,
        events: {
          ...secondClubPreferences.events,
          REVIEW_PUBLISHED: true,
        },
      });
      await currentSave.promise;
    });
    await waitFor(() => {
      expect(screen.getByRole("switch", { name: "이메일 알림" })).not.toBeChecked();
    });
    expect(screen.getByRole("button", { name: "알림 설정 저장" })).toBeEnabled();
  });
});
