import { useState } from "react";
import type { HostClubClosePreview } from "@/features/host/api/host-club-settings-contracts";

export function HostClubCloseDialog({ open, onClose, onPreview, onConfirm }: { open: boolean; onClose: () => void; onPreview: () => Promise<HostClubClosePreview>; onConfirm: (request: { previewId: string; effectHash: string; idempotencyKey: string }) => Promise<unknown> }) {
  const [preview, setPreview] = useState<HostClubClosePreview | null>(null);
  const [busy, setBusy] = useState(false);
  const [unknown, setUnknown] = useState(false);
  if (!open) return null;
  async function loadPreview() { setBusy(true); setUnknown(false); try { setPreview(await onPreview()); } finally { setBusy(false); } }
  async function confirm() { if (!preview) return; setBusy(true); setUnknown(false); try { await onConfirm({ previewId: preview.previewId, effectHash: preview.effectHash, idempotencyKey: crypto.randomUUID() }); } catch { setUnknown(true); } finally { setBusy(false); } }
  return <div role="dialog" aria-modal="true" aria-labelledby="close-club-title" className="surface stack">
    <h2 id="close-club-title">클럽 운영 종료</h2>
    <p>종료는 멤버 접근을 끝내는 고위험 작업입니다. 먼저 현재 revision에 묶인 영향을 확인합니다.</p>
    {!preview ? <button disabled={busy} type="button" onClick={() => { void loadPreview(); }}>종료 영향 미리보기</button> : <div className="stack"><p>멤버 접근이 종료됩니다.</p><p>공개 기록은 유지됩니다.</p><p className="small muted">preview revision {preview.clubRevision} · {new Date(preview.expiresAt).toLocaleString("ko-KR")}까지 유효</p><button className="btn-danger" disabled={busy} type="button" onClick={() => { void confirm(); }}>클럽 운영 종료 확인</button></div>}
    {unknown ? <p role="alert">결과를 확인할 수 없습니다. 다시 실행하지 말고 최신 클럽 상태를 새로고침해 확인해 주세요.</p> : null}
    <button type="button" onClick={onClose}>취소</button>
  </div>;
}
