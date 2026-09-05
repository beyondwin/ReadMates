import { useEffect, useRef, useState, type FormEvent, type RefObject } from "react";
import type { HostInvitationLinkView } from "@/features/host/model/host-settings-model";
import { ReadmatesIcon } from "@/shared/ui/icon";

export type HostInvitationCreateDraft = {
  name: string;
  maxUses: string;
  expiresAt: string;
};

export type HostInvitationEditDraft = HostInvitationCreateDraft & {
  linkId: string;
};

export type HostInvitationCommandAlert = {
  message: string;
  refreshLabel: string;
  retryLabel: string | null;
};

type Props = {
  links: HostInvitationLinkView[];
  loading: boolean;
  error: string | null;
  busy: boolean;
  createDraft: HostInvitationCreateDraft;
  editDraft: HostInvitationEditDraft | null;
  sharePath: string | null;
  message: string | null;
  alert: HostInvitationCommandAlert | null;
  onRetry: () => void;
  onRefresh: () => void;
  onCreateDraftChange: (draft: HostInvitationCreateDraft) => void;
  onEditDraftChange: (draft: HostInvitationEditDraft | null) => void;
  onCreate: () => void;
  onUpdate: (item: HostInvitationLinkView) => void;
  onToggle: (item: HostInvitationLinkView) => void;
  onRetryCommand: () => void;
  onCopySharePath: () => void;
  now?: Date;
  createOpen?: boolean;
  onCreateOpenChange?: (open: boolean) => void;
  showCreateTrigger?: boolean;
  createTriggerRef?: RefObject<HTMLButtonElement | null>;
  lastEventLabel?: string | null;
};

type InvitationPresentationStatus = "활성" | "만료 예정" | "중지" | "소진" | "만료";
type InvitationTab = "활성" | "만료 예정" | "중지";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function invitationPresentationStatus(
  link: HostInvitationLinkView,
  now: Date,
): InvitationPresentationStatus {
  if (link.status === "PAUSED") return "중지";
  if (link.status === "EXHAUSTED") return "소진";
  if (link.status === "EXPIRED") return "만료";
  const remaining = Date.parse(link.expiresAt) - now.getTime();
  if (Number.isFinite(remaining) && remaining <= 7 * MS_PER_DAY) return "만료 예정";
  return "활성";
}

function expiryLabel(link: HostInvitationLinkView, now: Date, status: InvitationPresentationStatus) {
  if (status === "중지") return "이력 보존";
  const expires = Date.parse(link.expiresAt);
  if (!Number.isFinite(expires)) return "제한 없음";
  const remaining = expires - now.getTime();
  if (status === "만료 예정") {
    const days = Math.max(1, Math.ceil(remaining / MS_PER_DAY));
    return `${days}일 남음`;
  }
  if (remaining > 365 * MS_PER_DAY) return "제한 없음";
  const date = new Date(expires);
  return `${date.getUTCMonth() + 1}월 ${date.getUTCDate()}일`;
}

function managementActions(status: InvitationPresentationStatus): ReadonlyArray<"보기" | "복사" | "연장" | "중지" | "이력"> {
  if (status === "만료 예정") return ["연장", "중지"];
  if (status === "중지") return ["이력"];
  if (status === "활성") return ["보기", "복사"];
  return ["이력"];
}

function matchesTab(status: InvitationPresentationStatus, tab: InvitationTab) {
  if (tab === "중지") return status === "중지" || status === "만료" || status === "소진";
  return status === tab;
}

export function HostInvitationLinks({
  links,
  loading,
  error,
  busy,
  createDraft,
  editDraft,
  sharePath,
  message,
  alert,
  onRetry,
  onRefresh,
  onCreateDraftChange,
  onEditDraftChange,
  onCreate,
  onUpdate,
  onToggle,
  onRetryCommand,
  onCopySharePath,
  now = new Date(),
  createOpen: createOpenProp,
  onCreateOpenChange,
  showCreateTrigger = true,
  createTriggerRef,
  lastEventLabel = null,
}: Props) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(Boolean(createDraft.name.trim()));
  const [statusFilter, setStatusFilter] = useState<InvitationTab>("활성");
  const internalTriggerRef = useRef<HTMLButtonElement>(null);
  const triggerRef = createTriggerRef ?? internalTriggerRef;
  const createOpen = createOpenProp ?? uncontrolledOpen;
  const setCreateOpen = onCreateOpenChange ?? setUncontrolledOpen;
  const presented = links.map((item) => {
    const status = invitationPresentationStatus(item, now);
    return { item, status, expiry: expiryLabel(item, now, status) };
  });
  const counts = {
    활성: presented.filter((row) => matchesTab(row.status, "활성")).length,
    "만료 예정": presented.filter((row) => matchesTab(row.status, "만료 예정")).length,
    중지: presented.filter((row) => matchesTab(row.status, "중지")).length,
  } as const;
  const visibleRows = presented.filter((row) => matchesTab(row.status, statusFilter));

  function submitCreate(event: FormEvent) {
    event.preventDefault();
    onCreate();
  }

  useEffect(() => {
    if (!createOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setCreateOpen(false);
      triggerRef.current?.focus();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [createOpen, setCreateOpen, triggerRef]);

  return (
    <section className="rm-host-invitations" aria-labelledby="named-links-title">
      <div>
        <h2 id="named-links-title">초대 링크</h2>
        <p className="small muted">링크 이름은 호스트만 볼 수 있어요.</p>
      </div>
      {showCreateTrigger ? (
        <button
          ref={triggerRef}
          className="btn btn-primary"
          type="button"
          aria-expanded={createOpen}
          onClick={() => setCreateOpen(!createOpen)}
        >
          새 초대 링크
        </button>
      ) : null}
      {createOpen ? (
        <form className="cluster" onSubmit={submitCreate}>
          <label>링크 이름<input value={createDraft.name} maxLength={120} required onChange={(event) => onCreateDraftChange({ ...createDraft, name: event.target.value })} /></label>
          <label>최대 사용 횟수<input type="number" min="1" max="10000" value={createDraft.maxUses} onChange={(event) => onCreateDraftChange({ ...createDraft, maxUses: event.target.value })} /></label>
          <label>만료일<input type="date" value={createDraft.expiresAt} onChange={(event) => onCreateDraftChange({ ...createDraft, expiresAt: event.target.value })} /></label>
          <button className="btn" disabled={busy || !createDraft.name.trim()} type="submit">초대 링크 만들기</button>
        </form>
      ) : null}
      {sharePath ? <button className="btn" type="button" onClick={onCopySharePath}>한 번만 복사</button> : null}
      {message ? <p role="status" className="small">{message}</p> : null}
      {alert ? <div role="alert" className="stack"><p>{alert.message}</p><button type="button" onClick={onRefresh}>{alert.refreshLabel}</button>{alert.retryLabel ? <button disabled={busy} type="button" onClick={onRetryCommand}>{alert.retryLabel}</button> : null}</div> : null}
      {loading ? <p role="status">초대 링크를 불러오는 중입니다.</p> : null}
      {error ? <div role="alert"><p>{error}</p><button type="button" onClick={onRetry}>다시 시도</button></div> : null}
      {!loading && !error && links.length === 0 ? <p className="muted">아직 만든 링크가 없습니다.</p> : null}
      {!loading && !error && links.length > 0 ? (
        <>
          <div className="rm-host-invitations__tabs" role="tablist" aria-label="초대 링크 상태">
            {([
              { id: "활성", label: "활성", count: counts.활성 },
              { id: "만료 예정", label: "만료 예정", count: counts["만료 예정"] },
              { id: "중지", label: "중지", count: counts.중지 },
            ] as const).map((chip) => {
              const selected = statusFilter === chip.id;
              return (
                <button
                  key={chip.id}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  aria-label={`${chip.label} ${chip.count}`}
                  onClick={() => setStatusFilter(chip.id)}
                >
                  {chip.label} {chip.count}
                </button>
              );
            })}
          </div>
          <table className="rm-host-invite-table" aria-label="초대 링크">
            <thead>
              <tr>
                <th scope="col">이름</th>
                <th scope="col">상태</th>
                <th scope="col">사용</th>
                <th scope="col">만료</th>
                <th scope="col">관리</th>
              </tr>
            </thead>
            <tbody>
              {visibleRows.map(({ item, status, expiry }) => (
                <tr key={item.linkId}>
                  <td>{item.name}</td>
                  <td>
                    <span className="rm-host-invite-status" data-status={status}>
                      <span className="rm-host-invite-status__dot" aria-hidden="true" />
                      {status}
                    </span>
                  </td>
                  <td>{item.usedCount} / {item.maxUses}</td>
                  <td>{expiry}</td>
                  <td>
                    <div className="rm-host-invitations__manage">
                      {managementActions(status).map((action) => {
                        if (action === "보기" || action === "연장" || action === "이력") {
                          return (
                            <button
                              key={action}
                              type="button"
                              onClick={() => onEditDraftChange({
                                linkId: item.linkId,
                                name: item.name,
                                maxUses: String(item.maxUses),
                                expiresAt: item.expiresAt.slice(0, 10),
                              })}
                            >
                              {action === "보기" ? "링크 보기" : action}
                            </button>
                          );
                        }
                        if (action === "복사") {
                          return sharePath ? (
                            <button key={action} type="button" onClick={onCopySharePath}>복사</button>
                          ) : null;
                        }
                        return (
                          <button
                            key={action}
                            type="button"
                            onClick={() => onToggle(item)}
                          >
                            {item.status === "ACTIVE" ? "중지" : "다시 시작"}
                          </button>
                        );
                      })}
                    </div>
                    {editDraft?.linkId === item.linkId ? (
                      <form className="cluster" onSubmit={(event) => { event.preventDefault(); onUpdate(item); }}>
                        <label>편집 링크 이름<input value={editDraft.name} onChange={(event) => onEditDraftChange({ ...editDraft, name: event.target.value })} /></label>
                        <label>편집 최대 사용 횟수<input type="number" min={Math.max(item.usedCount, 1)} max="10000" value={editDraft.maxUses} onChange={(event) => onEditDraftChange({ ...editDraft, maxUses: event.target.value })} /></label>
                        <label>편집 만료일<input type="date" value={editDraft.expiresAt} onChange={(event) => onEditDraftChange({ ...editDraft, expiresAt: event.target.value })} /></label>
                        <button disabled={busy} type="submit">링크 변경 저장</button>
                        <button disabled={busy} type="button" onClick={() => onEditDraftChange(null)}>링크 편집 취소</button>
                      </form>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <a
            className="rm-host-invitations__archived"
            href="#archived-links"
            onClick={(event) => {
              event.preventDefault();
              setStatusFilter("중지");
            }}
          >
            만료·중지된 링크 보기
          </a>
          <p className="rm-host-invitations__event">
            <ReadmatesIcon name="clock" size={16} />
            {lastEventLabel ?? "—"}
          </p>
        </>
      ) : null}
    </section>
  );
}
