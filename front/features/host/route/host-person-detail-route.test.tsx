import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { HostPersonDetail } from "@/features/host/api/host-person-contracts";

const api = vi.hoisted(() => ({
  fetchPerson: vi.fn(),
  fetchMembers: vi.fn(),
  submitProfile: vi.fn(),
  submitLifecycle: vi.fn(),
}));

vi.mock("@/features/host/api/host-person-api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/host/api/host-person-api")>()),
  fetchHostPersonDetail: api.fetchPerson,
}));

vi.mock("@/features/host/api/host-api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/host/api/host-api")>()),
  fetchHostMembers: api.fetchMembers,
  submitHostMemberProfile: api.submitProfile,
  submitHostMemberLifecycle: api.submitLifecycle,
}));

import { HostPersonDetailRoute } from "./host-person-detail-route";

function detail(overrides: Partial<HostPersonDetail> = {}): HostPersonDetail {
  return {
    membershipId: "membership-7",
    displayName: "정하늘",
    avatarKey: "banana-green-book",
    status: "ACTIVE",
    role: "MEMBER",
    lastClubAccessAt: "2026-08-29T10:00:00+09:00",
    currentSchedule: {
      state: "OPEN",
      scheduleRevision: 4,
      scheduledAt: "2026-09-03T19:30:00",
    },
    currentRsvp: "GOING",
    attendanceHistory: {
      items: [{ sessionNumber: 7, scheduledAt: "2026-08-20T19:30:00", attendanceStatus: "ATTENDED" }],
      nextCursor: "opaque attendance cursor",
    },
    ...overrides,
  };
}

function renderRoute() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/clubs/reading-sai/app/host/people/membership-7"]}>
        <Routes>
          <Route
            path="/clubs/:clubSlug/app/host/people/:membershipId"
            element={<HostPersonDetailRoute />}
          />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  api.fetchPerson.mockReset();
  api.fetchMembers.mockReset();
  api.submitProfile.mockReset();
  api.submitLifecycle.mockReset();
});

describe("HostPersonDetailRoute", () => {
  it("loads only the URL membership detail and renders the privacy allowlist", async () => {
    api.fetchPerson.mockResolvedValue(detail());
    renderRoute();

    expect(await screen.findByRole("heading", { name: "정하늘" })).toBeVisible();
    expect(api.fetchPerson).toHaveBeenCalledWith(
      "membership-7",
      undefined,
      { clubSlug: "reading-sai" },
    );
    expect(api.fetchMembers).not.toHaveBeenCalled();
    expect(screen.getByText(/최근 접속/)).toBeVisible();
    expect(screen.getByText(/revision 4/)).toBeVisible();
    expect(screen.getByText(/참석 예정/)).toBeVisible();
    expect(screen.getByText("페이지 열람 기록은 수집하지 않습니다.")).toBeVisible();
    expect(screen.getByRole("link", { name: "사람" })).toHaveAttribute(
      "href",
      "/clubs/reading-sai/app/host/people",
    );
    expect(document.body).not.toHaveTextContent(/@example\.com|user-/);
  });

  it("fails closed when the response membership does not match the URL", async () => {
    api.fetchPerson.mockResolvedValue(detail({ membershipId: "membership-other" }));
    renderRoute();

    expect(await screen.findByRole("alert")).toHaveTextContent("사람 정보를 안전하게 확인하지 못했습니다");
    expect(screen.queryByText("정하늘")).not.toBeInTheDocument();
  });

  it("continues with the opaque cursor unchanged, deduplicates stable tuples, and retains rows on failure", async () => {
    const user = userEvent.setup();
    api.fetchPerson
      .mockResolvedValueOnce(detail())
      .mockResolvedValueOnce(detail({
        attendanceHistory: {
          items: [
            { sessionNumber: 7, scheduledAt: "2026-08-20T19:30:00", attendanceStatus: "ATTENDED" },
            { sessionNumber: 6, scheduledAt: "2026-07-20T19:30:00", attendanceStatus: "ABSENT" },
          ],
          nextCursor: "opaque next cursor",
        },
      }))
      .mockRejectedValueOnce(new Error("cursor failed"));
    renderRoute();

    const ledger = await screen.findByRole("region", { name: "참석 기록" });
    await user.click(within(ledger).getByRole("button", { name: "전체 출석 보기" }));
    expect(api.fetchPerson).toHaveBeenNthCalledWith(
      2,
      "membership-7",
      { attendanceCursor: "opaque attendance cursor", limit: 20 },
      { clubSlug: "reading-sai" },
    );
    expect(within(ledger).getAllByRole("listitem")).toHaveLength(2);

    await user.click(within(ledger).getByRole("button", { name: "전체 출석 보기" }));
    expect(await within(ledger).findByRole("alert")).toHaveTextContent("더 불러오지 못했습니다");
    expect(within(ledger).getAllByRole("listitem")).toHaveLength(2);
    expect(within(ledger).getByRole("button", { name: "참석 기록 다시 시도" })).toBeVisible();
  });

  it("renames through the existing profile mutation from the more menu", async () => {
    const user = userEvent.setup();
    api.fetchPerson.mockResolvedValue(detail());
    api.submitProfile.mockResolvedValue(new Response(JSON.stringify({
      membershipId: "membership-7",
      displayName: "새 이름",
    }), { status: 200, headers: { "Content-Type": "application/json" } }));
    renderRoute();

    await screen.findByRole("heading", { name: "정하늘" });
    await user.click(screen.getByRole("button", { name: "더 보기" }));
    await user.click(screen.getByRole("menuitem", { name: "이름 변경" }));
    await user.clear(screen.getByLabelText("이름"));
    await user.type(screen.getByLabelText("이름"), "새 이름");
    await user.click(screen.getByRole("button", { name: "이름 저장" }));

    expect(api.submitProfile).toHaveBeenCalledWith("membership-7", "새 이름", { clubSlug: "reading-sai" });
    expect(screen.queryByRole("dialog", { name: "정하늘 이름 수정" })).not.toBeInTheDocument();
  });

  it("excludes from the current session through the existing lifecycle path", async () => {
    const user = userEvent.setup();
    api.fetchPerson.mockResolvedValue(detail());
    api.submitLifecycle.mockResolvedValue(new Response(JSON.stringify({
      member: { membershipId: "membership-7" },
      currentSessionPolicyResult: "APPLIED",
    }), { status: 200, headers: { "Content-Type": "application/json" } }));
    renderRoute();

    await screen.findByRole("heading", { name: "정하늘" });
    await user.click(screen.getByRole("button", { name: "더 보기" }));
    await user.click(screen.getByRole("menuitem", { name: "모임 제외" }));
    await user.click(screen.getByRole("button", { name: "모임 제외" }));

    expect(api.submitLifecycle).toHaveBeenCalledWith(
      "membership-7",
      "/current-session/remove",
      undefined,
      { clubSlug: "reading-sai" },
    );
  });
});
