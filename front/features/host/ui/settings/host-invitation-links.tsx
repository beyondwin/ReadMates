import { useState, type FormEvent } from "react";
import type { HostInvitationLinkView } from "@/features/host/model/host-settings-model";

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
};

const statusCopy: Record<HostInvitationLinkView["status"], string> = {
  ACTIVE: "활성",
  PAUSED: "중지",
  EXHAUSTED: "소진",
  EXPIRED: "만료",
};

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
}: Props) {
  const [createOpen, setCreateOpen] = useState(Boolean(createDraft.name.trim()));

  function submitCreate(event: FormEvent) {
    event.preventDefault();
    onCreate();
  }

  return (
    <section className="stack rm-host-editorial-ledger__panel" aria-labelledby="named-links-title">
      <div>
        <p className="eyebrow">이름이 있는 초대 링크</p>
        <h2 id="named-links-title">초대 링크</h2>
      </div>
      <p className="small muted">링크 이름은 호스트만 볼 수 있어요. 생성된 경로는 지금 한 번만 복사할 수 있습니다.</p>
      <button className="btn" type="button" onClick={() => setCreateOpen((open) => !open)}>새 초대 링크</button>
      <form className={createOpen ? "cluster" : "sr-only"} onSubmit={submitCreate}>
        <label>링크 이름<input value={createDraft.name} maxLength={120} required onChange={(event) => onCreateDraftChange({ ...createDraft, name: event.target.value })} /></label>
        <label>최대 사용 횟수<input type="number" min="1" max="10000" value={createDraft.maxUses} onChange={(event) => onCreateDraftChange({ ...createDraft, maxUses: event.target.value })} /></label>
        <label>만료일<input type="date" value={createDraft.expiresAt} onChange={(event) => onCreateDraftChange({ ...createDraft, expiresAt: event.target.value })} /></label>
        <button className="btn" disabled={busy || !createDraft.name.trim()} type="submit">초대 링크 만들기</button>
      </form>
      {sharePath ? <button className="btn" type="button" onClick={onCopySharePath}>한 번만 복사</button> : null}
      {message ? <p role="status" className="small">{message}</p> : null}
      {alert ? <div role="alert" className="stack"><p>{alert.message}</p><button type="button" onClick={onRefresh}>{alert.refreshLabel}</button>{alert.retryLabel ? <button disabled={busy} type="button" onClick={onRetryCommand}>{alert.retryLabel}</button> : null}</div> : null}
      {loading ? <p role="status">초대 링크를 불러오는 중입니다.</p> : null}
      {error ? <div role="alert"><p>{error}</p><button type="button" onClick={onRetry}>다시 시도</button></div> : null}
      {!loading && !error && links.length === 0 ? <p className="muted">아직 만든 링크가 없습니다.</p> : null}
      <div className="stack">{links.map((item) => (
        <article className="rm-host-editorial-ledger__row" key={item.linkId}>
          <div className="rm-host-editorial-ledger__row-copy">
            <strong>{item.name}</strong>
            <span className="badge">{statusCopy[item.status]}</span>
            <span className="small muted">revision {item.revision}</span>
          </div>
          <p className="small muted">사용 {item.usedCount}/{item.maxUses} · 만료 {new Date(item.expiresAt).toLocaleDateString("ko-KR")}</p>
          <div className="cluster">
            {(item.status === "ACTIVE" || item.status === "PAUSED") ? (
              <button type="button" className="btn-quiet" onClick={() => onToggle(item)}>
                {item.status === "ACTIVE" ? "링크 일시정지" : "링크 다시 시작"}
              </button>
            ) : null}
            <button type="button" className="btn-quiet" onClick={() => onEditDraftChange({ linkId: item.linkId, name: item.name, maxUses: String(item.maxUses), expiresAt: item.expiresAt.slice(0, 10) })}>링크 편집</button>
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
        </article>
      ))}</div>
    </section>
  );
}
