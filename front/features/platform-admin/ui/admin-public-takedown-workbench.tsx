import { useState, type FormEvent } from "react";
import {
  normalizeTakedownReason,
  remoteCopyLimitationLabel,
  type AdminTakedownState,
  type TakedownPreviewRequest,
  type TakedownReasonCategory,
} from "../model/platform-admin-takedown-model";
import { ADMIN_COPY } from "../model/admin-copy";
import { AdminPageContext } from "./admin-page-context";
import { AdminReceiptTimeline } from "./admin-receipt-timeline";
import { AdminSafeActionDock, type AdminSafeActionState } from "./admin-action-dock";

type ConfirmInput = { reasonCategory: TakedownReasonCategory; reason: string };

type Props = {
  canOperate: boolean;
  state: AdminTakedownState;
  pending: boolean;
  error: string | null;
  onPreview: (target: TakedownPreviewRequest) => void;
  onConfirm: (input: ConfirmInput) => void;
};

export function AdminPublicTakedownWorkbench({
  canOperate,
  state,
  pending,
  error,
  onPreview,
  onConfirm,
}: Props) {
  const [clubId, setClubId] = useState("");
  const [sessionId, setSessionId] = useState("");
  const [publicationId, setPublicationId] = useState("");
  const [reasonCategory, setReasonCategory] = useState<TakedownReasonCategory>("PRIVATE_DATA");
  const [reason, setReason] = useState("");
  const [validationError, setValidationError] = useState<string | null>(null);

  if (!canOperate) {
    return (
      <div className="admin-public-takedown">
        <AdminPageContext
          eyebrow={ADMIN_COPY.eyebrow.takedown}
          heading="긴급 공개 회수"
          authority="긴급 회수 권한 없음"
        >
          <section className="surface" aria-label="긴급 공개 회수 권한 안내">
            <h2 className="h4 editorial">긴급 회수 권한이 없습니다.</h2>
            <p className="body muted">OWNER 또는 OPERATOR의 전용 capability가 필요한 시스템 운영 작업입니다.</p>
          </section>
        </AdminPageContext>
      </div>
    );
  }

  function submitPreview(event: FormEvent) {
    event.preventDefault();
    setValidationError(null);
    onPreview({ clubId: clubId.trim(), sessionId: sessionId.trim(), publicationId: publicationId.trim() });
  }

  function confirm() {
    try {
      const normalized = normalizeTakedownReason(reason);
      setValidationError(null);
      onConfirm({ reasonCategory, reason: normalized });
    } catch (cause) {
      setValidationError(cause instanceof Error ? cause.message : "회수 사유를 입력해 주세요.");
    }
  }

  const receiptState = state.kind === "origin-denied" ? state : null;
  const dockState = takedownDockState({ pending, receipt: Boolean(receiptState) });

  return (
    <div className="admin-club-operations admin-public-takedown">
      <AdminPageContext
        eyebrow={ADMIN_COPY.eyebrow.takedown}
        heading="긴급 공개 회수"
        authority="긴급 회수 가능"
      >
        {state.kind === "idle" ? (
          <form className="surface platform-admin-support-grants__form" aria-label="긴급 공개 회수 대상" onSubmit={submitPreview}>
            <div className="platform-admin-support-grants__fields">
              <IdField label="클럽 ID" value={clubId} onChange={setClubId} />
              <IdField label="모임 ID" value={sessionId} onChange={setSessionId} />
              <IdField label="공개 기록 ID" value={publicationId} onChange={setPublicationId} />
            </div>
            <p className="tiny muted">클럽 전환이 아니라 세 UUID로 공개 대상을 정확히 고정합니다.</p>
            <AdminSafeActionDock
              level="L3"
              authority="allowed"
              state={pending ? "pending" : "ready"}
              primary={
                <button type="submit" className="btn btn-secondary" disabled={pending || !clubId.trim() || !sessionId.trim() || !publicationId.trim()}>
                  {pending ? "대상 확인 중…" : "대상 확인"}
                </button>
              }
            />
          </form>
        ) : null}

        {state.kind === "preview" || state.kind === "confirming" ? (
          <section className="surface" aria-labelledby="takedown-preview-title">
            <p className="eyebrow">Exact target preview</p>
            <h2 id="takedown-preview-title" className="h4 editorial">회수 대상을 마지막으로 확인하세요</h2>
            <TargetDetails target={state.preview} generation={state.preview.targetGeneration} />
            <div>
              <h3 className="h6 editorial">현재 공개 surface</h3>
              {state.preview.currentSurfaces.length ? (
                <ul>{state.preview.currentSurfaces.map((surface) => <li key={surface}><code>{surface}</code></li>)}</ul>
              ) : <p className="muted">확인된 공개 surface 없음</p>}
            </div>
            <p className="body">{remoteCopyLimitationLabel(state.preview.remoteCopyLimitation)}</p>
            <p className="tiny muted">활성화 경계 · <code>{state.preview.activationBoundary}</code></p>
            <label className="field-group">
              <span className="label">사유 분류</span>
              <select
                className="input"
                value={reasonCategory}
                onChange={(event) => setReasonCategory(event.target.value as TakedownReasonCategory)}
              >
                <option value="PRIVATE_DATA">PRIVATE_DATA · 개인정보</option>
                <option value="LEGAL_REQUEST">LEGAL_REQUEST · 법적 요청</option>
                <option value="SECURITY_INCIDENT">SECURITY_INCIDENT · 보안 사고</option>
                <option value="PUBLIC_SAFETY">PUBLIC_SAFETY · 공공 안전</option>
              </select>
            </label>
            <label className="field-group">
              <span className="label">회수 사유</span>
              <textarea className="input" value={reason} onChange={(event) => setReason(event.target.value)} rows={4} />
            </label>
            {validationError ? <p role="alert" className="danger">{validationError}</p> : null}
            {error ? <p role="alert" className="danger">{error}</p> : null}
            <AdminSafeActionDock
              level="L3"
              authority={state.preview.confirmEnabled ? "allowed" : "denied"}
              state={state.preview.confirmEnabled ? (pending ? "pending" : "ready") : "forbidden"}
              reason={!state.preview.confirmEnabled ? state.preview.activationBoundary : undefined}
              primary={
                <button type="button" className="btn btn-primary" disabled={pending || !state.preview.confirmEnabled} onClick={confirm}>
                  {state.kind === "confirming" ? "원본 접근 차단 중…" : "긴급 회수 확인"}
                </button>
              }
            />
          </section>
        ) : null}

        {receiptState ? (
          <>
            <section className="surface" role="region" aria-label="변경 불가 회수 영수증">
              <p className="eyebrow">Immutable receipt</p>
              <h2 className="h4 editorial">원본 접근 차단 완료</h2>
              <dl>
                <Detail label="영수증 ID" value={receiptState.receipt.receiptId} />
                <Detail label="수렴 ID" value={receiptState.receipt.convergenceId} />
                <Detail label="클럽 ID" value={receiptState.receipt.clubId} />
                <Detail label="모임 ID" value={receiptState.receipt.sessionId} />
                <Detail label="공개 기록 ID" value={receiptState.receipt.publicationId} />
                <Detail label="원본 결과" value={receiptState.receipt.originResult} />
                <Detail label="커밋 generation" value={String(receiptState.receipt.committedGeneration)} />
                <Detail label="사유 분류" value={receiptState.receipt.reasonCategory} />
                <Detail label="사유 본문 비공개" value={receiptState.receipt.reasonRedacted ? "예" : "아니요"} />
                <Detail label="BFF eviction" value={receiptState.receipt.bffEvictionOutcome} />
                <Detail label="CDN purge" value={receiptState.receipt.cdnPurgeOutcome} />
                <Detail label="브라우저 재검증" value={receiptState.receipt.browserRevalidationOutcome} />
                <Detail label="커밋 시각" value={receiptState.receipt.createdAt} />
              </dl>
              <p className="body">{remoteCopyLimitationLabel(receiptState.receipt.remoteCopyLimitation)}</p>
            </section>

            <AdminReceiptTimeline
              level="L3"
              receiptId={`영수증 ${receiptState.receipt.receiptId}`}
              entries={[
                {
                  key: "origin",
                  label: `원본 접근 차단 완료 · generation ${receiptState.receipt.committedGeneration}`,
                  state: "succeeded",
                },
                { key: "bff", label: `BFF eviction · ${receiptState.receipt.bffEvictionOutcome}`, state: "pending" },
                { key: "cdn", label: `CDN purge · ${receiptState.receipt.cdnPurgeOutcome}`, state: "pending" },
                { key: "browser", label: `브라우저 재검증 · ${receiptState.receipt.browserRevalidationOutcome}`, state: "pending" },
              ]}
            />
            <AdminSafeActionDock
              level="L3"
              authority="allowed"
              state={dockState}
            />
          </>
        ) : null}
      </AdminPageContext>
    </div>
  );
}

function takedownDockState({
  pending,
  receipt,
}: {
  pending: boolean;
  receipt: boolean;
}): AdminSafeActionState {
  if (pending) return "pending";
  if (receipt) return "complete";
  return "ready";
}

function IdField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="field-group">
      <span className="label">{label}</span>
      <input className="input" value={value} onChange={(event) => onChange(event.target.value)} required autoComplete="off" />
    </label>
  );
}

function TargetDetails({ target, generation }: { target: TakedownPreviewRequest; generation: number }) {
  return (
    <dl>
      <Detail label="클럽 ID" value={target.clubId} />
      <Detail label="모임 ID" value={target.sessionId} />
      <Detail label="공개 기록 ID" value={target.publicationId} />
      <Detail label="현재 generation" value={String(generation)} />
    </dl>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return <div><dt className="tiny muted">{label}</dt><dd><code>{value}</code></dd></div>;
}
