import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type {
  HostClosePreviewView as HostClubClosePreview,
  HostInvitationLinkView as HostInvitationLink,
  HostSettingsView as Settings,
} from "@/features/host/model/host-settings-model";
import { HostClubCloseDialog } from "./host-club-close-dialog";
import { HostClubSettings } from "./host-club-settings";
import { HostCoHostManagement } from "./host-co-host-management";
import { HostInvitationLinks } from "./host-invitation-links";
import { HostSettingsHistory } from "./host-settings-history";

const link: HostInvitationLink = { linkId: "link-1", name: "가을 신규 멤버", status: "ACTIVE", maxUses: 4, usedCount: 1, expiresAt: "2026-09-30T00:00:00Z", revision: 2, createdAt: "2026-08-30T00:00:00Z", updatedAt: "2026-08-30T00:00:00Z" };
const settings: Settings = { clubId: "club-1", clubSlug: "reading-sai", name: "읽는사이", approvalPolicy: "INVITE_ONLY", defaultTimezone: "Asia/Seoul", scheduleReminderEnabled: true, recordPublicationDefault: "MEMBER", revision: 3, status: "ACTIVE" };

describe("host settings controls", () => {
  it("copies a newly issued path once and exposes link status controls", async () => {
    const user = userEvent.setup();
    const writeText = vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue(undefined);
    const path = `/clubs/reading-sai/invite/lnk_${"a".repeat(43)}`;
    const create = vi.fn().mockResolvedValue({ link, oneTimeSharePath: path, receipt: { receiptId: "r", action: "CREATED", linkId: "link-1", revision: 2, replayed: false } });
    render(<HostInvitationLinks links={[link]} loading={false} error={null} onRetry={vi.fn()} onRefresh={vi.fn()} onCreate={create} onUpdate={vi.fn()} />);
    expect(screen.getByText("ACTIVE")).toBeInTheDocument();
    await user.type(screen.getByLabelText("링크 이름"), "새 멤버");
    await user.click(screen.getByRole("button", { name: "초대 링크 만들기" }));
    await user.click(await screen.findByRole("button", { name: "한 번만 복사" }));
    expect(writeText).toHaveBeenCalledWith(path);
    expect(screen.queryByText(path)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "링크 일시정지" })).toBeInTheDocument();
  });

  it("retries an unknown create with the same idempotency key and refreshes the list", async () => {
    const user = userEvent.setup();
    const create = vi.fn().mockRejectedValueOnce(new Error("NETWORK")).mockResolvedValueOnce({ link, oneTimeSharePath: null, receipt: { receiptId: "r", action: "CREATED", linkId: "link-1", revision: 2, replayed: true } });
    const refresh = vi.fn().mockResolvedValue(undefined);
    render(<HostInvitationLinks links={[]} loading={false} error={null} onRetry={vi.fn()} onRefresh={refresh} onCreate={create} onUpdate={vi.fn()} />);
    await user.type(screen.getByLabelText("링크 이름"), "재시도 링크");
    await user.click(screen.getByRole("button", { name: "초대 링크 만들기" }));
    await user.click(await screen.findByRole("button", { name: "같은 요청 다시 확인" }));
    expect(create).toHaveBeenCalledTimes(2);
    expect(create.mock.calls[1][0].idempotencyKey).toBe(create.mock.calls[0][0].idempotencyKey);
    expect(refresh).toHaveBeenCalled();
  });

  it("edits link name capacity and expiry and recovers stale updates", async () => {
    const user = userEvent.setup();
    const update = vi.fn().mockRejectedValueOnce(new Error("INVITATION_LINK_STALE")).mockResolvedValueOnce(undefined);
    const refresh = vi.fn().mockResolvedValue(undefined);
    render(<HostInvitationLinks links={[link]} loading={false} error={null} onRetry={vi.fn()} onRefresh={refresh} onCreate={vi.fn()} onUpdate={update} />);
    await user.click(screen.getByRole("button", { name: "링크 편집" }));
    await user.clear(screen.getByLabelText("편집 링크 이름"));
    await user.type(screen.getByLabelText("편집 링크 이름"), "연장 링크");
    await user.clear(screen.getByLabelText("편집 최대 사용 횟수"));
    await user.type(screen.getByLabelText("편집 최대 사용 횟수"), "8");
    await user.click(screen.getByRole("button", { name: "링크 변경 저장" }));
    expect(update).toHaveBeenCalledWith("link-1", expect.objectContaining({ name: "연장 링크", maxUses: 8, expectedRevision: 2 }));
    expect(await screen.findByRole("alert")).toHaveTextContent("최신 상태");
    await user.click(screen.getByRole("button", { name: "최신 링크 상태 확인" }));
    expect(refresh).toHaveBeenCalled();
  });

  it("submits editable settings with the visible revision", async () => {
    const user = userEvent.setup();
    const save = vi.fn().mockResolvedValue(undefined);
    render(<HostClubSettings settings={settings} saving={false} stale={false} error={null} onSave={save} />);
    expect(screen.getByText("revision 3")).toBeInTheDocument();
    await user.clear(screen.getByLabelText("클럽 이름"));
    await user.type(screen.getByLabelText("클럽 이름"), "읽는사이 새 이름");
    await user.click(screen.getByRole("button", { name: "설정 저장" }));
    expect(save).toHaveBeenCalledWith(expect.objectContaining({ name: "읽는사이 새 이름", expectedRevision: 3 }));
  });

  it("requires a bound preview before club end and keeps unknown outcome recoverable", async () => {
    const user = userEvent.setup();
    const preview: HostClubClosePreview = { previewId: "preview-1", clubId: "club-1", actorMembershipId: "member-1", clubRevision: 3, effectHash: "a".repeat(64), effects: { clubStatus: "ARCHIVED", memberAccess: "ENDED", publicRecords: "UNCHANGED" }, expiresAt: "2026-08-30T01:00:00Z" };
    const onPreview = vi.fn().mockResolvedValue(preview);
    const onConfirm = vi.fn().mockRejectedValue(new Error("NETWORK"));
    const onRefresh = vi.fn().mockResolvedValue(undefined);
    render(<HostClubCloseDialog open onClose={vi.fn()} onPreview={onPreview} onConfirm={onConfirm} onRefresh={onRefresh} />);
    expect(screen.queryByRole("button", { name: "클럽 운영 종료 확인" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "종료 영향 미리보기" }));
    expect(await screen.findByText("공개 기록은 유지됩니다.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "클럽 운영 종료 확인" }));
    expect(await screen.findByText(/결과를 확인할 수 없습니다/)).toBeInTheDocument();
    expect(screen.queryByText("공개 기록은 유지됩니다.")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "최신 클럽 상태 확인" }));
    expect(onRefresh).toHaveBeenCalled();
    onConfirm.mockResolvedValueOnce(undefined);
    await user.click(screen.getByRole("button", { name: "같은 종료 요청 다시 확인" }));
    expect(onConfirm.mock.calls[1][0].idempotencyKey).toBe(onConfirm.mock.calls[0][0].idempotencyKey);
  });

  it("uses the visible settings revision and one idempotency key while reconciling a co-host change", async () => {
    const user = userEvent.setup();
    const change = vi.fn()
      .mockRejectedValueOnce(new Error("NETWORK"))
      .mockResolvedValueOnce(undefined);
    const refresh = vi.fn().mockResolvedValue(undefined);
    render(
      <HostCoHostManagement
        settingsRevision={7}
        members={[{
          membershipId: "membership-1",
          displayName: "은하",
          avatarKey: "cloud-green-book",
          status: "ACTIVE",
          role: "MEMBER",
        }]}
        busy={false}
        onChange={change}
        onRefresh={refresh}
      />,
    );

    expect(screen.queryByText(/@|email|userId/i)).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "은하 공동 호스트 지정" }));
    expect(change).toHaveBeenCalledWith(expect.objectContaining({
      membershipId: "membership-1",
      action: "promote",
      expectedRevision: 7,
    }));
    expect(refresh).toHaveBeenCalledTimes(1);
    await user.click(await screen.findByRole("button", { name: "같은 권한 변경 요청 다시 확인" }));
    expect(change.mock.calls[1][0].idempotencyKey).toBe(change.mock.calls[0][0].idempotencyKey);
    expect(refresh).toHaveBeenCalledTimes(2);
  });

  it("continues settings history with the exact cursor and retains visible rows on failure", async () => {
    const user = userEvent.setup();
    const loadMore = vi.fn().mockRejectedValue(new Error("internal stack detail"));
    render(
      <HostSettingsHistory
        page={{
          items: [{
            historyId: "history-1",
            revision: 6,
            action: "SETTINGS_UPDATED",
            subjectMembershipId: null,
            beforeSettings: { name: "이전 이름", secretFlag: "never render" },
            afterSettings: { name: "새 이름", secretFlag: "never render" },
            occurredAt: "2026-08-30T01:00:00Z",
          }],
          nextCursor: "opaque/history+cursor==",
        }}
        onLoadMore={loadMore}
      />,
    );

    await user.click(screen.getByRole("button", { name: "설정 변경 이력 더 보기" }));
    expect(loadMore).toHaveBeenCalledWith("opaque/history+cursor==");
    expect(screen.getByText("클럽 이름").closest("div")).toHaveTextContent("이전 이름 → 새 이름");
    expect(screen.queryByText("never render")).not.toBeInTheDocument();
    expect(await screen.findByRole("alert")).toHaveTextContent("보이는 이력은 유지됩니다");
    expect(screen.queryByText("internal stack detail")).not.toBeInTheDocument();
  });

  it("clears an expired close preview and requires a fresh explicit preview", async () => {
    const user = userEvent.setup();
    const preview: HostClubClosePreview = { previewId: "preview-1", clubId: "club-1", actorMembershipId: "member-1", clubRevision: 3, effectHash: "a".repeat(64), effects: { clubStatus: "ARCHIVED", memberAccess: "ENDED", publicRecords: "UNCHANGED" }, expiresAt: "2026-08-30T01:00:00Z" };
    const onConfirm = vi.fn().mockRejectedValue(new Error("PREVIEW_EXPIRED"));
    render(<HostClubCloseDialog open onClose={vi.fn()} onPreview={vi.fn().mockResolvedValue(preview)} onConfirm={onConfirm} onRefresh={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: "종료 영향 미리보기" }));
    await user.click(await screen.findByRole("button", { name: "클럽 운영 종료 확인" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("미리보기가 더 이상 유효하지 않습니다");
    expect(screen.queryByText("공개 기록은 유지됩니다.")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "새 종료 영향 미리보기" })).toBeVisible();
  });

  it("offers a retry when close preview loading fails", async () => {
    const user = userEvent.setup();
    const preview: HostClubClosePreview = { previewId: "preview-1", clubId: "club-1", actorMembershipId: "member-1", clubRevision: 3, effectHash: "a".repeat(64), effects: { clubStatus: "ARCHIVED", memberAccess: "ENDED", publicRecords: "UNCHANGED" }, expiresAt: "2026-08-30T01:00:00Z" };
    const onPreview = vi.fn().mockRejectedValueOnce(new Error("NETWORK")).mockResolvedValueOnce(preview);
    render(<HostClubCloseDialog open onClose={vi.fn()} onPreview={onPreview} onConfirm={vi.fn()} onRefresh={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: "종료 영향 미리보기" }));
    await user.click(await screen.findByRole("button", { name: "미리보기 다시 시도" }));
    expect(await screen.findByText("공개 기록은 유지됩니다.")).toBeInTheDocument();
  });
});
