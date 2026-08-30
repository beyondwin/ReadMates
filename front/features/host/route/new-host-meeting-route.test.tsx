import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";

const routeMocks = vi.hoisted(() => ({
  create: vi.fn(),
  open: vi.fn(),
  createReset: vi.fn(),
  reconcileCreate: vi.fn(),
  resolveCreate: vi.fn(),
  openReset: vi.fn(),
  refetchDefaults: vi.fn(),
  recordScheduleDefaults: vi.fn(),
  defaults: {
    automatic: {
      startTime: "19:30",
      endTime: "21:30",
      locationLabel: "책방 안쪽",
      accessScope: "HOST_ONLY" as const,
      suggestedDate: "2026-09-12",
      questionDeadlineOffsetDays: 1,
    },
    previousOnlineMeeting: {
      meetingUrl: "https://meet.example.com/previous",
      meetingPasscode: "previous-secret",
    },
    hints: ["최근 4개 모임에서 가장 자주 사용한 시간입니다."],
  },
  defaultsState: "success" as "success" | "loading" | "error",
}));

vi.mock("@/shared/observability/frontend-observability", () => ({
  recordHostScheduleDefaults: routeMocks.recordScheduleDefaults,
}));

vi.mock("@tanstack/react-query", () => ({
  useQuery: () => ({
    data: routeMocks.defaultsState === "success" ? routeMocks.defaults : undefined,
    isPending: routeMocks.defaultsState === "loading",
    isFetching: routeMocks.defaultsState === "loading",
    isSuccess: routeMocks.defaultsState === "success",
    isError: routeMocks.defaultsState === "error",
    error: routeMocks.defaultsState === "error" ? new Error("defaults unavailable") : null,
    refetch: routeMocks.refetchDefaults,
  }),
  useQueryClient: () => ({
    invalidateQueries: vi.fn(),
  }),
}));

vi.mock("@/features/host/queries/host-session-queries", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/host/queries/host-session-queries")>()),
  hostSessionScheduleDefaultsQuery: () => ({}),
  publishHostSessionCreated: vi.fn(),
  publishHostSessionResponse: vi.fn(),
  useCreateHostSessionMutation: () => ({
    mutateAsync: routeMocks.create,
    reconcilePendingCreate: routeMocks.reconcileCreate,
    resolvePendingCreate: routeMocks.resolveCreate,
    hasPendingCreate: false,
    isPending: false,
    reset: routeMocks.createReset,
    reconciliationState: "idle",
  }),
  useOpenHostSessionMutation: () => ({
    mutateAsync: routeMocks.open,
    isPending: false,
    reset: routeMocks.openReset,
    reconciliationState: "idle",
  }),
}));

import { hostSensitiveStorage } from "@/features/host/storage/host-sensitive-storage";
import { NewHostMeetingRoute } from "./new-host-meeting-route";

function PathProbe() {
  return <output aria-label="current path">{useLocation().pathname}</output>;
}

function renderRoute() {
  return render(
    <MemoryRouter initialEntries={["/clubs/reading-sai/app/host/sessions/new"]}>
      <Routes>
        <Route
          path="/clubs/:clubSlug/app/host/sessions/new"
          element={<><NewHostMeetingRoute /><PathProbe /></>}
        />
        <Route
          path="/clubs/:clubSlug/app/host/sessions/:sessionId"
          element={<PathProbe />}
        />
      </Routes>
    </MemoryRouter>,
  );
}

async function fillRequiredFields(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText("모임 제목"), "여덟 번째 모임");
  await user.type(screen.getByLabelText("책 제목"), "물고기는 존재하지 않는다");
  await user.type(screen.getByLabelText("저자"), "룰루 밀러");
}

beforeEach(() => {
  routeMocks.create.mockReset();
  routeMocks.open.mockReset();
  routeMocks.createReset.mockReset();
  routeMocks.reconcileCreate.mockReset();
  routeMocks.resolveCreate.mockReset();
  routeMocks.openReset.mockReset();
  routeMocks.refetchDefaults.mockReset();
  routeMocks.recordScheduleDefaults.mockReset();
  routeMocks.defaultsState = "success";
  routeMocks.create.mockResolvedValue(new Response(JSON.stringify({
    sessionId: "meeting-8",
    sessionNumber: 8,
    state: "DRAFT",
    accessScope: "HOST_ONLY",
  }), { status: 201, headers: { "Content-Type": "application/json" } }));
  routeMocks.reconcileCreate.mockResolvedValue(new Response(JSON.stringify({
    sessionId: "meeting-8",
    sessionNumber: 8,
    state: "DRAFT",
    accessScope: "HOST_ONLY",
  }), { status: 201, headers: { "Content-Type": "application/json" } }));
  routeMocks.open.mockResolvedValue(new Response(JSON.stringify({
    sessionId: "meeting-8",
    state: "OPEN",
    accessScope: "GUEST_READABLE",
  }), { status: 200, headers: { "Content-Type": "application/json" } }));
});

describe("NewHostMeetingRoute", () => {
  it("records the schedule-defaults result after an in-flight request settles", async () => {
    routeMocks.defaultsState = "loading";
    const view = renderRoute();

    routeMocks.defaultsState = "success";
    view.rerender(
      <MemoryRouter initialEntries={["/clubs/reading-sai/app/host/sessions/new"]}>
        <Routes>
          <Route path="/clubs/:clubSlug/app/host/sessions/new" element={<NewHostMeetingRoute />} />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => expect(routeMocks.recordScheduleDefaults).toHaveBeenCalledWith({ outcome: "success" }));
  });

  it("applies safe per-field suggestions and creates one host-only hidden draft", async () => {
    const user = userEvent.setup();
    renderRoute();

    expect(screen.getByLabelText("모임 날짜")).toHaveValue("2026-09-12");
    expect(screen.getByLabelText("시작 시간")).toHaveValue("19:30");
    expect(screen.getByLabelText("장소")).toHaveValue("책방 안쪽");
    expect(screen.getByLabelText("미팅 URL")).toHaveValue("");
    expect(screen.getByLabelText("Passcode · 선택")).toHaveValue("");

    await fillRequiredFields(user);
    await user.click(screen.getByRole("button", { name: "모임 초안 저장" }));

    await waitFor(() => expect(routeMocks.create).toHaveBeenCalledWith(expect.objectContaining({
      title: "여덟 번째 모임",
      bookTitle: "물고기는 존재하지 않는다",
      bookAuthor: "룰루 밀러",
      date: "2026-09-12",
      startTime: "19:30",
      locationLabel: "책방 안쪽",
      meetingUrl: "",
      meetingPasscode: "",
      accessScope: "HOST_ONLY",
    })));
    expect(routeMocks.open).not.toHaveBeenCalled();
    expect(routeMocks.createReset).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "멤버와 준비 시작" })).toBeVisible();
    expect(screen.queryByRole("dialog", { name: /알림/ })).not.toBeInTheDocument();
  });

  it("preserves input and focuses the field named by a server 400", async () => {
    const user = userEvent.setup();
    routeMocks.create.mockResolvedValueOnce(new Response(JSON.stringify({
      code: "INVALID_REQUEST",
      message: "bookTitle must not be blank",
      status: 400,
      field: "bookTitle",
    }), { status: 400, headers: { "Content-Type": "application/json" } }));
    renderRoute();
    await fillRequiredFields(user);

    const title = screen.getByLabelText("책 제목");
    await user.click(screen.getByRole("button", { name: "모임 초안 저장" }));

    await waitFor(() => expect(title).toHaveFocus());
    expect(title).toHaveValue("물고기는 존재하지 않는다");
    expect(screen.getByText("책 제목을 확인해 주세요.")).toBeVisible();
  });

  it("preserves every input and focuses the form summary for an unknown server 400 field", async () => {
    const user = userEvent.setup();
    routeMocks.create.mockResolvedValueOnce(new Response(JSON.stringify({
      code: "INVALID_REQUEST",
      message: "meeting payload is invalid",
      status: 400,
    }), { status: 400, headers: { "Content-Type": "application/json" } }));
    renderRoute();
    await fillRequiredFields(user);
    await user.type(screen.getByLabelText("미팅 URL"), "https://meet.example.com/private");
    await user.type(screen.getByLabelText("Passcode · 선택"), "private-code");

    await user.click(screen.getByRole("button", { name: "모임 초안 저장" }));

    const summary = await screen.findByRole("alert", { name: "모임 저장 오류" });
    await waitFor(() => expect(summary).toHaveFocus());
    expect(screen.getByLabelText("모임 제목")).toHaveValue("여덟 번째 모임");
    expect(screen.getByLabelText("책 제목")).toHaveValue("물고기는 존재하지 않는다");
    expect(screen.getByLabelText("미팅 URL")).toHaveValue("https://meet.example.com/private");
    expect(screen.getByLabelText("Passcode · 선택")).toHaveValue("private-code");
    expect(screen.getByLabelText("모임 제목")).not.toHaveAttribute("aria-invalid", "true");
    expect(routeMocks.resolveCreate).toHaveBeenCalledTimes(1);
  });

  it("focuses meeting time only when the server returns the canonical meetingTime field", async () => {
    const user = userEvent.setup();
    routeMocks.create.mockResolvedValueOnce(new Response(JSON.stringify({
      code: "INVALID_REQUEST",
      message: "모임 요청 값을 확인해 주세요.",
      status: 400,
      field: "meetingTime",
    }), { status: 400, headers: { "Content-Type": "application/json" } }));
    renderRoute();
    await fillRequiredFields(user);
    await user.clear(screen.getByLabelText("시작 시간"));
    await user.type(screen.getByLabelText("시작 시간"), "23:00");

    await user.click(screen.getByRole("button", { name: "모임 초안 저장" }));

    await waitFor(() => expect(screen.getByLabelText("시작 시간")).toHaveFocus());
    expect(screen.getByLabelText("시작 시간")).toHaveValue("23:00");
    expect(screen.getByText("시작 시간을 확인해 주세요.")).toBeVisible();
    expect(screen.getByLabelText("모임 제목")).not.toHaveAttribute("aria-invalid", "true");
  });

  it("keeps the draft and offers only same-key reconciliation while create is pending", async () => {
    const user = userEvent.setup();
    const pending = new (await import("../queries/host-session-queries")).HostMutationPendingError();
    routeMocks.create.mockRejectedValueOnce(pending);
    renderRoute();
    await fillRequiredFields(user);

    await user.click(screen.getByRole("button", { name: "모임 초안 저장" }));

    const check = await screen.findByRole("button", { name: "저장 결과 확인" });
    expect(screen.queryByRole("button", { name: "모임 초안 저장" })).not.toBeInTheDocument();
    expect(screen.getByLabelText("모임 제목")).toHaveValue("여덟 번째 모임");
    expect(screen.getByLabelText("모임 제목")).toBeDisabled();
    expect(routeMocks.create).toHaveBeenCalledTimes(1);

    await user.click(check);

    await screen.findByRole("heading", { name: "모임 초안을 저장했습니다" });
    expect(routeMocks.reconcileCreate).toHaveBeenCalledTimes(1);
    expect(routeMocks.create).toHaveBeenCalledTimes(1);
    expect(routeMocks.resolveCreate).toHaveBeenCalledTimes(1);
  });

  it("keeps same-key reconciliation when a successful create body is unknown", async () => {
    const user = userEvent.setup();
    routeMocks.create.mockResolvedValueOnce(new Response("{}", {
      status: 201,
      headers: { "Content-Type": "application/json" },
    }));
    renderRoute();
    await fillRequiredFields(user);

    await user.click(screen.getByRole("button", { name: "모임 초안 저장" }));

    await screen.findByRole("button", { name: "저장 결과 확인" });
    expect(screen.getByLabelText("모임 제목")).toHaveValue("여덟 번째 모임");
    expect(screen.getByLabelText("모임 제목")).toBeDisabled();
    expect(routeMocks.create).toHaveBeenCalledTimes(1);
    expect(routeMocks.resolveCreate).not.toHaveBeenCalled();
  });

  it("clears the full URL/passcode draft and reconciliation state on authority purge", async () => {
    const user = userEvent.setup();
    renderRoute();
    await user.type(screen.getByLabelText("미팅 URL"), "https://meet.example.com/private");
    await user.type(screen.getByLabelText("Passcode · 선택"), "private-code");

    await hostSensitiveStorage.clearClub("reading-sai");

    await waitFor(() => {
      expect(screen.getByLabelText("미팅 URL")).toHaveValue("");
      expect(screen.getByLabelText("Passcode · 선택")).toHaveValue("");
    });
    expect(routeMocks.createReset).toHaveBeenCalled();
    expect(routeMocks.openReset).toHaveBeenCalled();
  });

  it("opens only after a separate confirmation and navigates under canonical clubSlug", async () => {
    const user = userEvent.setup();
    renderRoute();
    await fillRequiredFields(user);
    await user.click(screen.getByRole("button", { name: "모임 초안 저장" }));
    await screen.findByRole("button", { name: "멤버와 준비 시작" });

    await user.click(screen.getByRole("button", { name: "멤버와 준비 시작" }));
    expect(routeMocks.open).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "확인하고 준비 시작" }));

    await waitFor(() => expect(routeMocks.open).toHaveBeenCalledWith("meeting-8"));
    await waitFor(() => expect(screen.getByLabelText("current path")).toHaveTextContent(
      "/clubs/reading-sai/app/host/sessions/meeting-8",
    ));
  });
});
