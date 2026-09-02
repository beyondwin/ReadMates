import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TransitionSafetyRegistrationPort } from "@/shared/model/global-space";
import { SpaceTransitionSafetyProvider } from "@/shared/ui/space-transition-safety-context";
import {
  createGlobalSpaceTransitionCoordinator,
  createRetiredReceiptCapsuleRegistry,
} from "@/src/app/global-space-transition";

vi.mock("@/features/host/api/host-club-settings-api", () => ({
  fetchHostClubSettings: vi.fn(),
  fetchHostClubSettingsHistory: vi.fn(),
  updateHostClubSettings: vi.fn(),
  changeHostCoHost: vi.fn(),
  previewHostClubClose: vi.fn(),
  confirmHostClubClose: vi.fn(),
}));

vi.mock("@/features/host/api/host-invitation-link-api", () => ({
  fetchHostInvitationLinks: vi.fn(),
  fetchHostInvitationLinkHistory: vi.fn(),
  createHostInvitationLink: vi.fn(),
  updateHostInvitationLink: vi.fn(),
}));

vi.mock("@/features/host/api/host-api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/host/api/host-api")>()),
  fetchHostMembers: vi.fn(),
}));

import {
  changeHostCoHost,
  confirmHostClubClose,
  fetchHostClubSettings,
  fetchHostClubSettingsHistory,
  previewHostClubClose,
  updateHostClubSettings,
} from "@/features/host/api/host-club-settings-api";
import {
  createHostInvitationLink,
  fetchHostInvitationLinks,
  updateHostInvitationLink,
} from "@/features/host/api/host-invitation-link-api";
import { fetchHostMembers } from "@/features/host/api/host-api";
import { ReadmatesApiError, ReadmatesTransportError } from "@/shared/api/errors";
import { HostSettingsRoute } from "./host-settings-route";

const settings = {
  clubId: "club-1",
  clubSlug: "reading-sai",
  name: "읽는사이",
  approvalPolicy: "INVITE_ONLY" as const,
  defaultTimezone: "Asia/Seoul",
  scheduleReminderEnabled: true,
  recordPublicationDefault: "MEMBER" as const,
  revision: 3,
  status: "ACTIVE" as const,
};

const link = {
  linkId: "link-1",
  name: "가을 신규 멤버",
  status: "ACTIVE" as const,
  maxUses: 4,
  usedCount: 1,
  expiresAt: "2026-09-30T00:00:00Z",
  revision: 2,
  createdAt: "2026-08-30T00:00:00Z",
  updatedAt: "2026-08-30T00:00:00Z",
};

const created = {
  link,
  oneTimeSharePath: `/clubs/reading-sai/invite/lnk_${"a".repeat(43)}`,
  receipt: {
    receiptId: "receipt-link-1",
    action: "CREATED" as const,
    linkId: "link-1",
    revision: 2,
    replayed: false,
  },
};

const member = {
  membershipId: "member-1",
  userId: "user-1",
  email: "member@example.test",
  displayName: "은하",
  accountName: "member-1",
  profileImageUrl: null,
  avatarKey: "cloud-green-book",
  role: "MEMBER" as const,
  status: "ACTIVE" as const,
  joinedAt: "2026-08-01T00:00:00Z",
  createdAt: "2026-08-01T00:00:00Z",
  lastClubAccessAt: "2026-08-30T00:00:00Z",
  currentSessionParticipationStatus: "ACTIVE" as const,
  canSuspend: true,
  canRestore: false,
  canDeactivate: true,
  canAddToCurrentSession: false,
  canRemoveFromCurrentSession: true,
};

const previewOne = {
  previewId: "preview-1",
  clubId: "club-1",
  actorMembershipId: "member-1",
  clubRevision: 3,
  effectHash: "a".repeat(64),
  effects: { clubStatus: "ARCHIVED" as const, memberAccess: "ENDED" as const, publicRecords: "UNCHANGED" as const },
  expiresAt: "2026-09-01T12:00:00Z",
};

function apiError(code: string, status: number, fallback = false) {
  return new ReadmatesApiError(
    { code, status, message: "구조화된 서버 오류", fallback },
    new Response(null, { status }),
  );
}

function renderRoute(transitionPort: TransitionSafetyRegistrationPort) {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: Infinity },
      mutations: { retry: false },
    },
  });
  const rendered = render(
    <QueryClientProvider client={client}>
      <SpaceTransitionSafetyProvider port={transitionPort}>
        <MemoryRouter initialEntries={["/clubs/reading-sai/app/host/settings"]}>
          <Routes>
            <Route path="/clubs/:clubSlug/app/host/settings" element={<HostSettingsRoute />} />
          </Routes>
        </MemoryRouter>
      </SpaceTransitionSafetyProvider>
    </QueryClientProvider>,
  );
  return { client, ...rendered };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(fetchHostClubSettings).mockResolvedValue(settings);
  vi.mocked(fetchHostClubSettingsHistory).mockResolvedValue({ items: [], nextCursor: null });
  vi.mocked(fetchHostInvitationLinks).mockResolvedValue({ items: [link], nextCursor: null });
  vi.mocked(fetchHostMembers).mockResolvedValue({ items: [member], nextCursor: null });
  vi.mocked(updateHostClubSettings).mockResolvedValue({ settings, receipt: { receiptId: "settings-r", action: "SETTINGS_UPDATED", revision: 4, replayed: false } });
  vi.mocked(changeHostCoHost).mockResolvedValue({ membershipId: "member-1", role: "HOST", revision: 4, receipt: { receiptId: "cohost-r", action: "CO_HOST_PROMOTED", revision: 4, replayed: false } });
  vi.mocked(previewHostClubClose).mockResolvedValue(previewOne);
  vi.mocked(confirmHostClubClose).mockResolvedValue({ receiptId: "close-r", status: "ARCHIVED", revision: 4, replayed: false });
  vi.mocked(createHostInvitationLink).mockResolvedValue(created);
  vi.mocked(updateHostInvitationLink).mockResolvedValue({ link, receipt: created.receipt });
});

describe("HostSettingsRoute transition ownership", () => {
  it("publishes the one-time share path and all settings caches before completing the accepted handle", async () => {
    const coordinator = createGlobalSpaceTransitionCoordinator();
    const beginPending = coordinator.beginPending.bind(coordinator);
    const publishedSurfaces: string[] = [];
    vi.spyOn(coordinator, "beginPending").mockImplementation((registration) => {
      const handle = beginPending(registration);
      const publishAccepted = handle.publishAccepted.bind(handle);
      vi.spyOn(handle, "publishAccepted").mockImplementation((action) => {
        publishedSurfaces.push(action.surface);
        return publishAccepted(action);
      });
      return handle;
    });
    const { client } = renderRoute(coordinator);
    const invalidate = vi.spyOn(client, "invalidateQueries");
    const clipboardWrite = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: clipboardWrite },
    });
    await screen.findByRole("heading", { name: "초대 링크" });

    await userEvent.type(screen.getByLabelText("링크 이름"), "가을 신규 멤버");
    await userEvent.click(screen.getByRole("button", { name: "초대 링크 만들기" }));

    const copyButton = await screen.findByRole("button", { name: "한 번만 복사" });
    expect(createHostInvitationLink).toHaveBeenCalledTimes(1);
    expect(invalidate).toHaveBeenCalledTimes(3);
    expect(invalidate.mock.calls.map(([filters]) => filters.queryKey)).toEqual(expect.arrayContaining([
      ["host", "reading-sai", "club-settings"],
      ["host", "reading-sai", "invitation-links"],
      ["host", "reading-sai", "members"],
    ]));
    expect(publishedSurfaces).toEqual(["cache", "receiptCallback", "successCopy"]);

    await userEvent.click(copyButton);
    expect(clipboardWrite).toHaveBeenCalledWith(created.oneTimeSharePath);
    expect(screen.queryByRole("button", { name: "한 번만 복사" })).not.toBeInTheDocument();
    expect(screen.getByText("복사했습니다. 이 화면에서는 링크를 다시 표시하지 않습니다.")).toBeInTheDocument();
  });

  it("keeps an unknown command dirty and retries only on an explicit same-identity action", async () => {
    vi.mocked(createHostInvitationLink)
      .mockRejectedValueOnce(new ReadmatesTransportError())
      .mockResolvedValueOnce({ ...created, oneTimeSharePath: null, receipt: { ...created.receipt, replayed: true } });
    const coordinator = createGlobalSpaceTransitionCoordinator();
    renderRoute(coordinator);
    await screen.findByRole("heading", { name: "초대 링크" });

    await userEvent.type(screen.getByLabelText("링크 이름"), "같은 요청 복구");
    await userEvent.click(screen.getByRole("button", { name: "초대 링크 만들기" }));

    const retry = await screen.findByRole("button", { name: "같은 요청 다시 확인" });
    expect(createHostInvitationLink).toHaveBeenCalledTimes(1);
    expect(coordinator.getSnapshot()).toMatchObject({ kind: "dirty" });
    const firstRequest = vi.mocked(createHostInvitationLink).mock.calls[0]?.[0];

    await userEvent.click(retry);
    await waitFor(() => expect(createHostInvitationLink).toHaveBeenCalledTimes(2));
    expect(vi.mocked(createHostInvitationLink).mock.calls[1]?.[0]).toEqual(firstRequest);
    expect(await screen.findByText("이 요청은 이미 처리되었습니다. 안전을 위해 링크는 다시 표시하지 않습니다.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "같은 요청 다시 확인" })).not.toBeInTheDocument();
    await waitFor(() => expect(coordinator.getSnapshot()).toEqual({ kind: "clean" }));
  });

  it("submits the visible settings revision and publishes the authoritative success revision", async () => {
    const updated = { ...settings, name: "읽는사이 새 이름", revision: 4 };
    vi.mocked(fetchHostClubSettings).mockResolvedValueOnce(settings).mockResolvedValue(updated);
    vi.mocked(updateHostClubSettings).mockResolvedValue({
      settings: updated,
      receipt: { receiptId: "settings-r", action: "SETTINGS_UPDATED", revision: 4, replayed: false },
    });
    renderRoute(createGlobalSpaceTransitionCoordinator());
    const clubName = await screen.findByLabelText("클럽 이름");

    await userEvent.clear(clubName);
    await userEvent.type(clubName, updated.name);
    await userEvent.click(screen.getByRole("button", { name: "설정 저장" }));

    await waitFor(() => expect(updateHostClubSettings).toHaveBeenCalledTimes(1));
    expect(updateHostClubSettings).toHaveBeenCalledWith(expect.objectContaining({
      name: updated.name,
      expectedRevision: 3,
      idempotencyKey: expect.any(String),
    }), { clubSlug: "reading-sai" });
    expect(await screen.findByText("revision 4")).toBeVisible();
    expect(screen.getByLabelText("클럽 이름")).toHaveValue(updated.name);
  });

  it("classifies a structured settings stale response and adopts the authoritative revision", async () => {
    const latest = { ...settings, name: "다른 운영자가 저장한 이름", revision: 4 };
    vi.mocked(fetchHostClubSettings).mockResolvedValueOnce(settings).mockResolvedValue(latest);
    vi.mocked(updateHostClubSettings).mockRejectedValue(apiError("HOST_SETTINGS_STALE", 409));
    renderRoute(createGlobalSpaceTransitionCoordinator());
    const clubName = await screen.findByLabelText("클럽 이름");

    await userEvent.clear(clubName);
    await userEvent.type(clubName, "충돌한 로컬 이름");
    await userEvent.click(screen.getByRole("button", { name: "설정 저장" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("다른 운영자가 먼저 변경했습니다");
    expect(screen.getByText("revision 4")).toBeVisible();
    expect(screen.getByLabelText("클럽 이름")).toHaveValue(latest.name);
    expect(updateHostClubSettings).toHaveBeenCalledTimes(1);
  });

  it("classifies a structured invitation-link stale response, refreshes, and requires a fresh edit", async () => {
    const latestLink = { ...link, name: "서버 최신 링크", revision: 3 };
    vi.mocked(fetchHostInvitationLinks)
      .mockResolvedValueOnce({ items: [link], nextCursor: null })
      .mockResolvedValue({ items: [latestLink], nextCursor: null });
    vi.mocked(updateHostInvitationLink).mockRejectedValue(apiError("INVITATION_LINK_STALE", 409));
    renderRoute(createGlobalSpaceTransitionCoordinator());
    await screen.findByText(link.name);

    await userEvent.click(screen.getByRole("button", { name: "링크 편집" }));
    await userEvent.clear(screen.getByLabelText("편집 링크 이름"));
    await userEvent.type(screen.getByLabelText("편집 링크 이름"), "충돌한 링크 이름");
    await userEvent.click(screen.getByRole("button", { name: "링크 변경 저장" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("링크가 변경되었습니다");
    expect(await screen.findByText(latestLink.name)).toBeVisible();
    expect(screen.queryByLabelText("편집 링크 이름")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "같은 변경 요청 다시 확인" })).not.toBeInTheDocument();
    expect(updateHostInvitationLink).toHaveBeenCalledTimes(1);
  });

  it("publishes a structured co-host rejection without retaining a retry identity", async () => {
    vi.mocked(changeHostCoHost).mockRejectedValue(apiError("LAST_ACTIVE_HOST_REQUIRED", 409));
    renderRoute(createGlobalSpaceTransitionCoordinator());
    const action = await screen.findByRole("button", { name: "은하 공동 호스트 지정" });

    await userEvent.click(action);

    expect(await screen.findByRole("alert")).toHaveTextContent("서버가 현재 호스트 권한 변경을 허용하지 않았습니다");
    expect(screen.queryByRole("button", { name: "같은 권한 변경 요청 다시 확인" })).not.toBeInTheDocument();
    expect(changeHostCoHost).toHaveBeenCalledTimes(1);
  });

  it("discards a non-current close preview and requires a new preview and command identity", async () => {
    const previewTwo = { ...previewOne, previewId: "preview-2", clubRevision: 4, effectHash: "b".repeat(64) };
    vi.mocked(previewHostClubClose).mockResolvedValueOnce(previewOne).mockResolvedValueOnce(previewTwo);
    vi.mocked(confirmHostClubClose)
      .mockRejectedValueOnce(apiError("HOST_SETTINGS_STALE", 409))
      .mockResolvedValueOnce({ receiptId: "close-r-2", status: "ARCHIVED", revision: 5, replayed: false });
    renderRoute(createGlobalSpaceTransitionCoordinator());
    await screen.findByRole("heading", { name: "클럽 운영 종료" });

    await userEvent.click(screen.getByRole("button", { name: "종료 검토" }));
    await userEvent.click(screen.getByRole("button", { name: "종료 영향 미리보기" }));
    await userEvent.click(await screen.findByRole("button", { name: "클럽 운영 종료 확인" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("미리보기가 더 이상 유효하지 않습니다");
    expect(screen.queryByRole("button", { name: "같은 종료 요청 다시 확인" })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "새 종료 영향 미리보기" }));
    await userEvent.click(await screen.findByRole("button", { name: "클럽 운영 종료 확인" }));
    await waitFor(() => expect(confirmHostClubClose).toHaveBeenCalledTimes(2));
    const first = vi.mocked(confirmHostClubClose).mock.calls[0]?.[0];
    const second = vi.mocked(confirmHostClubClose).mock.calls[1]?.[0];
    expect(first).toMatchObject({ previewId: "preview-1", effectHash: "a".repeat(64) });
    expect(second).toMatchObject({ previewId: "preview-2", effectHash: "b".repeat(64) });
    expect(second?.idempotencyKey).not.toBe(first?.idempotencyKey);
  });

  it("keeps close-preview failure route-owned and retries without bypassing the dialog", async () => {
    vi.mocked(previewHostClubClose).mockRejectedValueOnce(new Error("preview unavailable")).mockResolvedValueOnce(previewOne);
    renderRoute(createGlobalSpaceTransitionCoordinator());
    await screen.findByRole("heading", { name: "클럽 운영 종료" });

    await userEvent.click(screen.getByRole("button", { name: "종료 검토" }));
    await userEvent.click(screen.getByRole("button", { name: "종료 영향 미리보기" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("종료 영향을 불러오지 못했습니다");
    await userEvent.click(screen.getByRole("button", { name: "미리보기 다시 시도" }));

    expect(await screen.findByText("공개 기록은 유지됩니다.")).toBeVisible();
    expect(previewHostClubClose).toHaveBeenCalledTimes(2);
  });

  it("clears a pending create identity and publishes nothing after unmount plus authority loss", async () => {
    const original = deferred<typeof created>();
    vi.mocked(createHostInvitationLink).mockReturnValue(original.promise);
    const registry = createRetiredReceiptCapsuleRegistry();
    const coordinator = createGlobalSpaceTransitionCoordinator({ registry });
    const beginPending = vi.spyOn(coordinator, "beginPending");
    const { client, unmount } = renderRoute(coordinator);
    const invalidate = vi.spyOn(client, "invalidateQueries");
    const storageWrite = vi.spyOn(Storage.prototype, "setItem");
    await screen.findByRole("heading", { name: "초대 링크" });
    await userEvent.type(screen.getByLabelText("링크 이름"), "권한 상실 링크");
    await userEvent.click(screen.getByRole("button", { name: "초대 링크 만들기" }));
    await waitFor(() => expect(createHostInvitationLink).toHaveBeenCalledTimes(1));

    const registration = beginPending.mock.calls.at(-1)?.[0];
    expect(registration?.recovery.kind).toBe("receipt");
    if (!registration || registration.recovery.kind !== "receipt") throw new Error("receipt recovery required");
    const capsule = registration.recovery.capsule as typeof registration.recovery.capsule & {
      replayCount: () => number;
      retainedRequest: () => unknown;
    };
    const handle = beginPending.mock.results.at(-1)!.value;
    const publishAccepted = vi.spyOn(handle, "publishAccepted");

    unmount();
    coordinator.invalidateForAuthorityLoss();
    original.resolve(created);
    await act(() => original.promise);
    await waitFor(() => expect(registry.size()).toBe(0));

    expect(createHostInvitationLink).toHaveBeenCalledTimes(1);
    expect(capsule.replayCount()).toBe(0);
    expect(capsule.retainedRequest()).toBeNull();
    expect(publishAccepted).not.toHaveBeenCalled();
    expect(invalidate).not.toHaveBeenCalled();
    expect(storageWrite).not.toHaveBeenCalled();
    await expect(handle.reconcile()).resolves.toEqual({
      operationId: registration.operationId,
      outcome: "authority-lost",
    });
    storageWrite.mockRestore();
  });

  it("aggregates settings and invitation drafts, then releases clean state on reset", async () => {
    const coordinator = createGlobalSpaceTransitionCoordinator();
    renderRoute(coordinator);
    const clubName = await screen.findByLabelText("클럽 이름");
    expect(coordinator.getSnapshot()).toEqual({ kind: "clean" });

    await userEvent.type(clubName, " 수정");
    expect(coordinator.getSnapshot()).toMatchObject({ kind: "dirty" });
    await userEvent.clear(clubName);
    await userEvent.type(clubName, settings.name);
    await waitFor(() => expect(coordinator.getSnapshot()).toEqual({ kind: "clean" }));

    const createName = screen.getByLabelText("링크 이름");
    await userEvent.type(createName, "작성 중");
    expect(coordinator.getSnapshot()).toMatchObject({ kind: "dirty" });
    await userEvent.clear(createName);
    await waitFor(() => expect(coordinator.getSnapshot()).toEqual({ kind: "clean" }));

    await userEvent.click(screen.getByRole("button", { name: "링크 편집" }));
    expect(coordinator.getSnapshot()).toMatchObject({ kind: "dirty" });
    await userEvent.click(screen.getByRole("button", { name: "링크 편집 취소" }));
    await waitFor(() => expect(coordinator.getSnapshot()).toEqual({ kind: "clean" }));

    await userEvent.click(screen.getByRole("button", { name: "종료 검토" }));
    expect(coordinator.getSnapshot()).toMatchObject({ kind: "dirty" });
    await userEvent.click(screen.getByRole("button", { name: "취소" }));
    await waitFor(() => expect(coordinator.getSnapshot()).toEqual({ kind: "clean" }));
  });

  it("performs one same-identity detached lookup on normal unmount", async () => {
    const original = deferred<typeof created>();
    vi.mocked(createHostInvitationLink)
      .mockReturnValueOnce(original.promise)
      .mockResolvedValueOnce({ ...created, oneTimeSharePath: null, receipt: { ...created.receipt, replayed: true } });
    const registry = createRetiredReceiptCapsuleRegistry();
    const coordinator = createGlobalSpaceTransitionCoordinator({ registry });
    const { unmount } = renderRoute(coordinator);
    await screen.findByRole("heading", { name: "초대 링크" });
    await userEvent.type(screen.getByLabelText("링크 이름"), "분리 복구 링크");
    await userEvent.click(screen.getByRole("button", { name: "초대 링크 만들기" }));
    await waitFor(() => expect(createHostInvitationLink).toHaveBeenCalledTimes(1));
    const firstRequest = vi.mocked(createHostInvitationLink).mock.calls[0]?.[0];

    unmount();
    await waitFor(() => expect(createHostInvitationLink).toHaveBeenCalledTimes(2));
    expect(vi.mocked(createHostInvitationLink).mock.calls[1]?.[0]).toEqual(firstRequest);
    original.resolve(created);
    await act(() => original.promise);
    await waitFor(() => expect(registry.size()).toBe(0));
  });
});

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((next) => { resolve = next; });
  return { promise, resolve };
}
