import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import type {
  HostClosePreviewView as HostClubClosePreview,
  HostInvitationLinkView as HostInvitationLink,
  HostSettingsView as Settings,
} from "@/features/host/model/host-settings-model";
import { HostClubCloseDialog } from "./host-club-close-dialog";
import { HostClubSettings } from "./host-club-settings";
import { HostCoHostManagement } from "./host-co-host-management";
import { HostInvitationLinks, type HostInvitationCreateDraft } from "./host-invitation-links";
import { HostSettingsHistory } from "./host-settings-history";

const link: HostInvitationLink = { linkId: "link-1", name: "가을 신규 멤버", status: "ACTIVE", maxUses: 4, usedCount: 1, expiresAt: "2026-09-30T00:00:00Z", revision: 2, createdAt: "2026-08-30T00:00:00Z", updatedAt: "2026-08-30T00:00:00Z" };
const settings: Settings = { clubId: "club-1", clubSlug: "reading-sai", name: "읽는사이", approvalPolicy: "INVITE_ONLY", defaultTimezone: "Asia/Seoul", scheduleReminderEnabled: true, recordPublicationDefault: "MEMBER", revision: 3, status: "ACTIVE" };
const preview: HostClubClosePreview = { previewId: "preview-1", clubId: "club-1", actorMembershipId: "member-1", clubRevision: 3, effectHash: "a".repeat(64), effects: { clubStatus: "ARCHIVED", memberAccess: "ENDED", publicRecords: "UNCHANGED" }, expiresAt: "2026-08-30T01:00:00Z" };

function InvitationHarness({ onCreate = vi.fn(), onCopy = vi.fn() }: { onCreate?: () => void; onCopy?: () => void }) {
  const [draft, setDraft] = useState<HostInvitationCreateDraft>({ name: "", maxUses: "20", expiresAt: "2026-09-30" });
  return <HostInvitationLinks
    links={[link]}
    loading={false}
    error={null}
    busy={false}
    createDraft={draft}
    editDraft={null}
    sharePath="/clubs/reading-sai/invite/one-time"
    message="한 번만 표시됩니다."
    alert={{ message: "최신 목록에서 결과를 확인해 주세요.", refreshLabel: "최신 목록 확인", retryLabel: "같은 요청 다시 확인" }}
    onRetry={vi.fn()}
    onRefresh={vi.fn()}
    onCreateDraftChange={setDraft}
    onEditDraftChange={vi.fn()}
    onCreate={onCreate}
    onUpdate={vi.fn()}
    onToggle={vi.fn()}
    onRetryCommand={vi.fn()}
    onCopySharePath={onCopy}
  />;
}

describe("host settings presentation controls", () => {
  it("renders route-owned invitation outcome and emits create/copy callbacks", async () => {
    const onCreate = vi.fn();
    const onCopy = vi.fn();
    render(<InvitationHarness onCreate={onCreate} onCopy={onCopy} />);
    expect(screen.queryByLabelText("링크 이름")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "새 초대 링크" }));
    await userEvent.type(screen.getByLabelText("링크 이름"), "새 멤버");
    await userEvent.click(screen.getByRole("button", { name: "초대 링크 만들기" }));
    await userEvent.click(screen.getByRole("button", { name: "한 번만 복사" }));
    expect(onCreate).toHaveBeenCalledTimes(1);
    expect(onCopy).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("alert")).toHaveTextContent("최신 목록");
    expect(screen.getByRole("button", { name: "링크 보기" })).toBeInTheDocument();
  });

  it("emits controlled settings draft changes and save intent", async () => {
    const onDraftChange = vi.fn();
    const onSave = vi.fn();
    render(<HostClubSettings settings={settings} draft={settings} saving={false} stale={false} error={null} onDraftChange={onDraftChange} onSave={onSave} />);
    await userEvent.click(screen.getByRole("button", { name: "수정" }));
    fireEvent.change(screen.getByLabelText("클럽 이름"), { target: { value: "읽는사이 새 이름" } });
    await userEvent.click(screen.getByRole("button", { name: "설정 저장" }));
    expect(onDraftChange).toHaveBeenCalledWith(expect.objectContaining({ name: "읽는사이 새 이름" }));
    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it("renders route-owned close preview and unknown recovery without executing work", async () => {
    const onConfirm = vi.fn();
    const onRetryConfirm = vi.fn();
    render(<HostClubCloseDialog open preview={preview} busy={false} previewError={false} recovery="unknown" canRetryConfirm onClose={vi.fn()} onPreview={vi.fn()} onConfirm={onConfirm} onRefresh={vi.fn()} onRetryConfirm={onRetryConfirm} />);
    expect(screen.getByText("공개 기록은 유지됩니다.")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("결과를 확인할 수 없습니다");
    await userEvent.click(screen.getByRole("button", { name: "클럽 운영 종료 확인" }));
    await userEvent.click(screen.getByRole("button", { name: "같은 종료 요청 다시 확인" }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onRetryConfirm).toHaveBeenCalledTimes(1);
  });

  it("renders route-owned co-host recovery and emits the selected member", async () => {
    const member = { membershipId: "membership-1", displayName: "은하", avatarKey: "cloud-green-book", status: "ACTIVE", role: "MEMBER" } as const;
    const onChange = vi.fn();
    const onRetryCommand = vi.fn();
    render(<HostCoHostManagement settingsRevision={7} members={[member]} busy={false} alert="같은 요청의 결과를 확인해 주세요." canRetry onChange={onChange} onRefresh={vi.fn()} onRetryCommand={onRetryCommand} />);
    await userEvent.click(screen.getByRole("button", { name: "은하 공동 호스트 지정" }));
    await userEvent.click(screen.getByRole("button", { name: "같은 권한 변경 요청 다시 확인" }));
    expect(onChange).toHaveBeenCalledWith(member);
    expect(onRetryCommand).toHaveBeenCalledTimes(1);
  });

  it("continues settings history with the exact cursor and retains visible rows on failure", async () => {
    const loadMore = vi.fn().mockRejectedValue(new Error("internal stack detail"));
    render(<HostSettingsHistory page={{ items: [{ historyId: "history-1", revision: 6, action: "SETTINGS_UPDATED", subjectMembershipId: null, beforeSettings: { name: "이전 이름", secretFlag: "never render" }, afterSettings: { name: "새 이름", secretFlag: "never render" }, occurredAt: "2026-08-30T01:00:00Z" }], nextCursor: "opaque/history+cursor==" }} onLoadMore={loadMore} />);
    await userEvent.click(screen.getByRole("button", { name: "설정 변경 이력 더 보기" }));
    expect(loadMore).toHaveBeenCalledWith("opaque/history+cursor==");
    expect(screen.getByText("클럽 이름").closest("div")).toHaveTextContent("이전 이름 → 새 이름");
    expect(screen.queryByText("never render")).not.toBeInTheDocument();
    expect(await screen.findByRole("alert")).toHaveTextContent("보이는 이력은 유지됩니다");
  });
});
