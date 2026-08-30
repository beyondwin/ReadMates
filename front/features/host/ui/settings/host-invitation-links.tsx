import { useState, type FormEvent } from "react";
import type { HostInvitationLink, HostInvitationLinkCreateResult, UpdateHostInvitationLinkRequest } from "@/features/host/api/host-invitation-link-contracts";

type Props = {
  links: HostInvitationLink[];
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  onCreate: (request: { name: string; maxUses: number; expiresAt: string; idempotencyKey: string }) => Promise<HostInvitationLinkCreateResult>;
  onUpdate: (linkId: string, request: UpdateHostInvitationLinkRequest) => Promise<unknown>;
};

const commandKey = () => crypto.randomUUID();

export function HostInvitationLinks({ links, loading, error, onRetry, onCreate, onUpdate }: Props) {
  const [name, setName] = useState("");
  const [sharePath, setSharePath] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      const expiresAt = new Date(Date.now() + 30 * 86_400_000).toISOString();
      const result = await onCreate({ name: name.trim(), maxUses: 20, expiresAt, idempotencyKey: commandKey() });
      setSharePath(result.oneTimeSharePath);
      setName("");
      if (!result.oneTimeSharePath) setMessage("이 요청은 이미 처리되었습니다. 안전을 위해 링크는 다시 표시하지 않습니다.");
    } catch {
      setMessage("링크 생성 결과를 확인할 수 없습니다. 목록을 새로고침한 뒤 다시 확인해 주세요.");
    } finally {
      setBusy(false);
    }
  }

  async function copyOnce() {
    if (!sharePath) return;
    await navigator.clipboard.writeText(sharePath);
    setSharePath(null);
    setMessage("복사했습니다. 이 화면에서는 링크를 다시 표시하지 않습니다.");
  }

  async function changeStatus(item: HostInvitationLink) {
    const status = item.status === "ACTIVE" ? "PAUSED" : "ACTIVE";
    await onUpdate(item.linkId, { name: item.name, maxUses: item.maxUses, expiresAt: item.expiresAt, expectedRevision: item.revision, status, idempotencyKey: commandKey() });
  }

  return (
    <section className="surface-quiet stack rm-host-editorial-ledger__panel" aria-labelledby="named-links-title">
      <div><p className="eyebrow">이름이 있는 초대 링크</p><h2 id="named-links-title">공유 링크</h2></div>
      <p className="small muted">초대 대상이 구분되도록 이름을 붙입니다. 생성된 경로는 지금 한 번만 복사할 수 있습니다.</p>
      <form className="cluster" onSubmit={(event) => { void submit(event); }}>
        <label>링크 이름<input value={name} maxLength={120} required onChange={(event) => setName(event.target.value)} /></label>
        <button className="btn" disabled={busy || !name.trim()} type="submit">초대 링크 만들기</button>
      </form>
      {sharePath ? <button className="btn" type="button" onClick={() => { void copyOnce(); }}>한 번만 복사</button> : null}
      {message ? <p role="status" className="small">{message}</p> : null}
      {loading ? <p role="status">초대 링크를 불러오는 중입니다.</p> : null}
      {error ? <div role="alert"><p>{error}</p><button type="button" onClick={onRetry}>다시 시도</button></div> : null}
      {!loading && !error && links.length === 0 ? <p className="muted">아직 만든 링크가 없습니다.</p> : null}
      <div className="stack">
        {links.map((item) => <article className="surface stack" key={item.linkId}>
          <div className="cluster"><strong>{item.name}</strong><span className="badge">{item.status}</span><span className="small muted">revision {item.revision}</span></div>
          <p className="small muted">사용 {item.usedCount}/{item.maxUses} · 만료 {new Date(item.expiresAt).toLocaleDateString("ko-KR")}</p>
          {(item.status === "ACTIVE" || item.status === "PAUSED") ? <button type="button" className="btn-quiet" onClick={() => { void changeStatus(item); }}>{item.status === "ACTIVE" ? "링크 일시정지" : "링크 다시 시작"}</button> : null}
        </article>)}
      </div>
    </section>
  );
}
