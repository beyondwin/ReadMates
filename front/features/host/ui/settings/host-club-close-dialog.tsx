import type { HostClosePreviewView } from "@/features/host/model/host-settings-model";

export type HostCloseRecovery = "unknown" | "non-current" | "rejected" | null;

export function HostClubCloseDialog({
  open,
  preview,
  busy,
  previewError,
  recovery,
  canRetryConfirm,
  onClose,
  onPreview,
  onConfirm,
  onRefresh,
  onRetryConfirm,
}: {
  open: boolean;
  preview: HostClosePreviewView | null;
  busy: boolean;
  previewError: boolean;
  recovery: HostCloseRecovery;
  canRetryConfirm: boolean;
  onClose: () => void;
  onPreview: () => void;
  onConfirm: () => void;
  onRefresh: () => void;
  onRetryConfirm: () => void;
}) {
  if (!open) return null;

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="close-club-title" className="surface stack">
      <h2 id="close-club-title">클럽 운영 종료</h2>
      <p>종료는 멤버 접근을 끝내는 고위험 작업입니다. 먼저 현재 revision에 묶인 영향을 확인합니다.</p>
      {!preview ? (
        <button disabled={busy} type="button" onClick={onPreview}>
          {recovery === "non-current" || recovery === "rejected"
            ? "새 종료 영향 미리보기"
            : previewError ? "미리보기 다시 시도" : "종료 영향 미리보기"}
        </button>
      ) : (
        <div className="stack">
          <p>멤버 접근이 종료됩니다.</p>
          <p>공개 기록은 유지됩니다.</p>
          <p className="small muted">preview revision {preview.clubRevision} · {new Date(preview.expiresAt).toLocaleString("ko-KR")}까지 유효</p>
          <button className="btn-danger" disabled={busy} type="button" onClick={onConfirm}>클럽 운영 종료 확인</button>
        </div>
      )}
      {previewError ? <p role="alert">종료 영향을 불러오지 못했습니다. 같은 화면에서 다시 시도할 수 있습니다.</p> : null}
      {recovery ? (
        <div role="alert" className="stack">
          <p>{recovery === "non-current"
            ? "미리보기가 더 이상 유효하지 않습니다. 최신 상태를 확인하고 새 미리보기를 명시적으로 요청해 주세요."
            : recovery === "rejected"
              ? "기존 종료 요청은 서버가 거절했습니다. 최신 상태를 확인하고 새 미리보기를 명시적으로 요청해 주세요."
              : "결과를 확인할 수 없습니다. 최신 클럽 상태를 확인하거나 같은 종료 요청으로 다시 확인해 주세요."}</p>
          <button type="button" onClick={onRefresh}>최신 클럽 상태 확인</button>
          {canRetryConfirm ? <button disabled={busy} type="button" onClick={onRetryConfirm}>같은 종료 요청 다시 확인</button> : null}
        </div>
      ) : null}
      <button type="button" onClick={onClose}>취소</button>
    </div>
  );
}
