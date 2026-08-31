import { useState, type FormEvent } from "react";
import type {
  HostInvitationLinkCreateView,
  HostInvitationLinkUpdateRequest,
  HostInvitationLinkView,
} from "@/features/host/model/host-settings-model";

type CreateRequest = { name: string; maxUses: number; expiresAt: string; idempotencyKey: string };
type Props = { links: HostInvitationLinkView[]; loading: boolean; error: string | null; onRetry: () => void; onRefresh: () => Promise<unknown> | void; onCreate: (request: CreateRequest) => Promise<HostInvitationLinkCreateView>; onUpdate: (linkId: string, request: HostInvitationLinkUpdateRequest) => Promise<unknown> };
const commandKey = () => crypto.randomUUID();
const defaultExpiry = () => new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10);
const expiryIso = (date: string) => new Date(`${date}T23:59:59Z`).toISOString();
const isStale = (error: unknown) => error instanceof Error && /STALE|REVISION|409/.test(error.message);

export function HostInvitationLinks({ links, loading, error, onRetry, onRefresh, onCreate, onUpdate }: Props) {
  const [name, setName] = useState(""); const [maxUses, setMaxUses] = useState("20"); const [expiresAt, setExpiresAt] = useState(defaultExpiry);
  const [sharePath, setSharePath] = useState<string | null>(null); const [message, setMessage] = useState<string | null>(null); const [alert, setAlert] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  const [pendingCreate, setPendingCreate] = useState<CreateRequest | null>(null); const [pendingUpdate, setPendingUpdate] = useState<{ linkId: string; request: HostInvitationLinkUpdateRequest } | null>(null);
  const [editing, setEditing] = useState<HostInvitationLinkView | null>(null); const [editName, setEditName] = useState(""); const [editMaxUses, setEditMaxUses] = useState(""); const [editExpiresAt, setEditExpiresAt] = useState("");

  async function runCreate(request: CreateRequest) { setBusy(true); setMessage(null); setAlert(null); try { const result = await onCreate(request); setSharePath(result.oneTimeSharePath); setPendingCreate(null); setName(""); if (!result.oneTimeSharePath) setMessage("이 요청은 이미 처리되었습니다. 안전을 위해 링크는 다시 표시하지 않습니다."); await onRefresh(); } catch { setPendingCreate(request); setAlert("링크 생성 결과를 확인할 수 없습니다. 최신 목록을 확인하거나 같은 요청으로 다시 확인해 주세요."); } finally { setBusy(false); } }
  async function submit(event: FormEvent) { event.preventDefault(); await runCreate({ name: name.trim(), maxUses: Number(maxUses), expiresAt: expiryIso(expiresAt), idempotencyKey: commandKey() }); }
  async function copyOnce() { if (!sharePath) return; await navigator.clipboard.writeText(sharePath); setSharePath(null); setMessage("복사했습니다. 이 화면에서는 링크를 다시 표시하지 않습니다."); }
  async function runUpdate(linkId: string, request: HostInvitationLinkUpdateRequest) { setBusy(true); setAlert(null); setMessage(null); try { await onUpdate(linkId, request); setPendingUpdate(null); setEditing(null); await onRefresh(); } catch (caught) { setPendingUpdate({ linkId, request }); setAlert(isStale(caught) ? "링크가 변경되었습니다. 최신 상태를 확인한 뒤 다시 편집해 주세요." : "링크 변경 결과를 확인할 수 없습니다. 같은 요청으로 다시 확인할 수 있습니다."); } finally { setBusy(false); } }
  function beginEdit(item: HostInvitationLinkView) { setEditing(item); setEditName(item.name); setEditMaxUses(String(item.maxUses)); setEditExpiresAt(item.expiresAt.slice(0, 10)); setAlert(null); }

  return <section className="surface-quiet stack rm-host-editorial-ledger__panel" aria-labelledby="named-links-title">
    <div><p className="eyebrow">이름이 있는 초대 링크</p><h2 id="named-links-title">공유 링크</h2></div><p className="small muted">초대 대상이 구분되도록 이름을 붙입니다. 생성된 경로는 지금 한 번만 복사할 수 있습니다.</p>
    <form className="cluster" onSubmit={(event) => { void submit(event); }}><label>링크 이름<input value={name} maxLength={120} required onChange={(event) => { setName(event.target.value); setPendingCreate(null); }} /></label><label>최대 사용 횟수<input type="number" min="1" max="10000" value={maxUses} onChange={(event) => { setMaxUses(event.target.value); setPendingCreate(null); }} /></label><label>만료일<input type="date" value={expiresAt} onChange={(event) => { setExpiresAt(event.target.value); setPendingCreate(null); }} /></label><button className="btn" disabled={busy || !name.trim()} type="submit">초대 링크 만들기</button></form>
    {sharePath ? <button className="btn" type="button" onClick={() => { void copyOnce(); }}>한 번만 복사</button> : null}{message ? <p role="status" className="small">{message}</p> : null}
    {alert ? <div role="alert" className="stack"><p>{alert}</p><button type="button" onClick={() => { void onRefresh(); }}>{alert.includes("최신 상태") ? "최신 링크 상태 확인" : "최신 목록 확인"}</button>{pendingCreate ? <button disabled={busy} type="button" onClick={() => { void runCreate(pendingCreate); }}>같은 요청 다시 확인</button> : null}{pendingUpdate && !alert.includes("최신 상태") ? <button disabled={busy} type="button" onClick={() => { void runUpdate(pendingUpdate.linkId, pendingUpdate.request); }}>같은 변경 요청 다시 확인</button> : null}</div> : null}
    {loading ? <p role="status">초대 링크를 불러오는 중입니다.</p> : null}{error ? <div role="alert"><p>{error}</p><button type="button" onClick={onRetry}>다시 시도</button></div> : null}{!loading && !error && links.length === 0 ? <p className="muted">아직 만든 링크가 없습니다.</p> : null}
    <div className="stack">{links.map((item) => <article className="surface stack" key={item.linkId}><div className="cluster"><strong>{item.name}</strong><span className="badge">{item.status}</span><span className="small muted">revision {item.revision}</span></div><p className="small muted">사용 {item.usedCount}/{item.maxUses} · 만료 {new Date(item.expiresAt).toLocaleDateString("ko-KR")}</p><div className="cluster">{(item.status === "ACTIVE" || item.status === "PAUSED") ? <button type="button" className="btn-quiet" onClick={() => { void runUpdate(item.linkId, { name: item.name, maxUses: item.maxUses, expiresAt: item.expiresAt, expectedRevision: item.revision, status: item.status === "ACTIVE" ? "PAUSED" : "ACTIVE", idempotencyKey: commandKey() }); }}>{item.status === "ACTIVE" ? "링크 일시정지" : "링크 다시 시작"}</button> : null}<button type="button" className="btn-quiet" onClick={() => beginEdit(item)}>링크 편집</button></div>
      {editing?.linkId === item.linkId ? <form className="cluster" onSubmit={(event) => { event.preventDefault(); void runUpdate(item.linkId, { name: editName.trim(), maxUses: Number(editMaxUses), expiresAt: expiryIso(editExpiresAt), expectedRevision: item.revision, status: item.status === "PAUSED" ? "PAUSED" : "ACTIVE", idempotencyKey: commandKey() }); }}><label>편집 링크 이름<input value={editName} onChange={(event) => setEditName(event.target.value)} /></label><label>편집 최대 사용 횟수<input type="number" min={Math.max(item.usedCount, 1)} max="10000" value={editMaxUses} onChange={(event) => setEditMaxUses(event.target.value)} /></label><label>편집 만료일<input type="date" value={editExpiresAt} onChange={(event) => setEditExpiresAt(event.target.value)} /></label><button disabled={busy} type="submit">링크 변경 저장</button></form> : null}</article>)}</div>
  </section>;
}
