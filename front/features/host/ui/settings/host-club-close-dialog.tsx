import { useState } from "react";
import type { HostClosePreviewView } from "@/features/host/model/host-settings-model";

type ConfirmRequest = { previewId: string; effectHash: string; idempotencyKey: string };
type Recovery = "unknown" | "expired" | null;

const isExpiredPreview = (error: unknown) =>
  error instanceof Error && /PREVIEW_(?:EXPIRED|STALE)|STALE_PREVIEW|410/.test(error.message);

export function HostClubCloseDialog({
  open,
  onClose,
  onPreview,
  onConfirm,
  onRefresh,
}: {
  open: boolean;
  onClose: () => void;
  onPreview: () => Promise<HostClosePreviewView>;
  onConfirm: (request: ConfirmRequest) => Promise<unknown>;
  onRefresh: () => Promise<unknown> | void;
}) {
  const [preview, setPreview] = useState<HostClosePreviewView | null>(null);
  const [busy, setBusy] = useState(false);
  const [previewError, setPreviewError] = useState(false);
  const [recovery, setRecovery] = useState<Recovery>(null);
  const [confirmRequest, setConfirmRequest] = useState<ConfirmRequest | null>(null);

  if (!open) return null;

  async function loadPreview() {
    setBusy(true);
    setPreviewError(false);
    setRecovery(null);
    try {
      const value = await onPreview();
      setPreview(value);
      setConfirmRequest(null);
    } catch {
      setPreviewError(true);
    } finally {
      setBusy(false);
    }
  }

  async function confirm() {
    const request = confirmRequest ?? (preview ? {
      previewId: preview.previewId,
      effectHash: preview.effectHash,
      idempotencyKey: crypto.randomUUID(),
    } : null);
    if (!request) return;
    setConfirmRequest(request);
    setBusy(true);
    setRecovery(null);
    try {
      await onConfirm(request);
      await onRefresh();
    } catch (error) {
      setPreview(null);
      setRecovery(isExpiredPreview(error) ? "expired" : "unknown");
      await onRefresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="close-club-title" className="surface stack">
      <h2 id="close-club-title">클럽 운영 종료</h2>
      <p>종료는 멤버 접근을 끝내는 고위험 작업입니다. 먼저 현재 revision에 묶인 영향을 확인합니다.</p>
      {!preview ? (
        <button disabled={busy} type="button" onClick={() => { void loadPreview(); }}>
          {recovery === "expired"
            ? "새 종료 영향 미리보기"
            : previewError ? "미리보기 다시 시도" : "종료 영향 미리보기"}
        </button>
      ) : (
        <div className="stack">
          <p>멤버 접근이 종료됩니다.</p>
          <p>공개 기록은 유지됩니다.</p>
          <p className="small muted">preview revision {preview.clubRevision} · {new Date(preview.expiresAt).toLocaleString("ko-KR")}까지 유효</p>
          <button className="btn-danger" disabled={busy} type="button" onClick={() => { void confirm(); }}>
            클럽 운영 종료 확인
          </button>
        </div>
      )}
      {previewError ? <p role="alert">종료 영향을 불러오지 못했습니다. 같은 화면에서 다시 시도할 수 있습니다.</p> : null}
      {recovery ? (
        <div role="alert" className="stack">
          <p>{recovery === "expired"
            ? "미리보기가 더 이상 유효하지 않습니다. 최신 상태를 확인하고 새 미리보기를 명시적으로 요청해 주세요."
            : "결과를 확인할 수 없습니다. 최신 클럽 상태를 확인하거나 같은 종료 요청으로 다시 확인해 주세요."}</p>
          <button type="button" onClick={() => { void onRefresh(); }}>최신 클럽 상태 확인</button>
          {confirmRequest ? (
            <button disabled={busy} type="button" onClick={() => { void confirm(); }}>
              같은 종료 요청 다시 확인
            </button>
          ) : null}
        </div>
      ) : null}
      <button type="button" onClick={onClose}>취소</button>
    </div>
  );
}
