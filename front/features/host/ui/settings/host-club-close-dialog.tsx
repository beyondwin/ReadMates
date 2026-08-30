import { useState } from "react";
import type { HostClubClosePreview } from "@/features/host/api/host-club-settings-contracts";

type ConfirmRequest = { previewId: string; effectHash: string; idempotencyKey: string };

export function HostClubCloseDialog({ open, onClose, onPreview, onConfirm, onRefresh }: { open: boolean; onClose: () => void; onPreview: () => Promise<HostClubClosePreview>; onConfirm: (request: ConfirmRequest) => Promise<unknown>; onRefresh: () => Promise<unknown> | void }) {
  const [preview, setPreview] = useState<HostClubClosePreview | null>(null); const [busy, setBusy] = useState(false); const [previewError, setPreviewError] = useState(false); const [unknown, setUnknown] = useState(false); const [confirmRequest, setConfirmRequest] = useState<ConfirmRequest | null>(null);
  if (!open) return null;
  async function loadPreview() { setBusy(true); setPreviewError(false); setUnknown(false); try { const value = await onPreview(); setPreview(value); setConfirmRequest(null); } catch { setPreviewError(true); } finally { setBusy(false); } }
  async function confirm() { if (!preview) return; const request = confirmRequest ?? { previewId: preview.previewId, effectHash: preview.effectHash, idempotencyKey: crypto.randomUUID() }; setConfirmRequest(request); setBusy(true); setUnknown(false); try { await onConfirm(request); await onRefresh(); } catch { setUnknown(true); } finally { setBusy(false); } }
  return <div role="dialog" aria-modal="true" aria-labelledby="close-club-title" className="surface stack"><h2 id="close-club-title">클럽 운영 종료</h2><p>종료는 멤버 접근을 끝내는 고위험 작업입니다. 먼저 현재 revision에 묶인 영향을 확인합니다.</p>
    {!preview ? <button disabled={busy} type="button" onClick={() => { void loadPreview(); }}>{previewError ? "미리보기 다시 시도" : "종료 영향 미리보기"}</button> : <div className="stack"><p>멤버 접근이 종료됩니다.</p><p>공개 기록은 유지됩니다.</p><p className="small muted">preview revision {preview.clubRevision} · {new Date(preview.expiresAt).toLocaleString("ko-KR")}까지 유효</p><button className="btn-danger" disabled={busy} type="button" onClick={() => { void confirm(); }}>클럽 운영 종료 확인</button></div>}
    {previewError ? <p role="alert">종료 영향을 불러오지 못했습니다. 같은 화면에서 다시 시도할 수 있습니다.</p> : null}
    {unknown ? <div role="alert" className="stack"><p>결과를 확인할 수 없습니다. 최신 클럽 상태를 확인하거나 같은 종료 요청으로 다시 확인해 주세요.</p><button type="button" onClick={() => { void onRefresh(); }}>최신 클럽 상태 확인</button><button disabled={busy} type="button" onClick={() => { void confirm(); }}>같은 종료 요청 다시 확인</button></div> : null}<button type="button" onClick={onClose}>취소</button></div>;
}
