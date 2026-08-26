import { useState, type FormEvent } from "react";
import {
  normalizeTakedownReason,
  remoteCopyLimitationLabel,
  type AdminTakedownState,
  type TakedownPreviewRequest,
  type TakedownReasonCategory,
} from "../model/platform-admin-takedown-model";
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
  onRetryConvergence: () => void;
};

export function AdminPublicTakedownWorkbench({
  canOperate,
  state,
  pending,
  error,
  onPreview,
  onConfirm,
  onRetryConvergence,
}: Props) {
  const [clubId, setClubId] = useState("");
  const [sessionId, setSessionId] = useState("");
  const [publicationId, setPublicationId] = useState("");
  const [reasonCategory, setReasonCategory] = useState<TakedownReasonCategory>("PRIVACY");
  const [reason, setReason] = useState("");
  const [validationError, setValidationError] = useState<string | null>(null);

  if (!canOperate) {
    return (
      <div className="admin-public-takedown">
        <AdminPageContext
          eyebrow="Emergency public operation"
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

  const receiptState = state.kind === "origin-denied" || state.kind === "convergence-failed" ? state : null;
  const dockState = takedownDockState({ pending, receipt: Boolean(receiptState) });

  return (
    <div className="admin-club-operations admin-public-takedown">
      <AdminPageContext
        eyebrow="Emergency public operation"
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
            <p className="body">{remoteCopyLimitationLabel(state.preview.limitationCode)}</p>
            <label className="field-group">
              <span className="label">사유 분류</span>
              <select
                className="input"
                value={reasonCategory}
                onChange={(event) => setReasonCategory(event.target.value as TakedownReasonCategory)}
              >
                <option value="PRIVACY">PRIVACY · 개인정보</option>
                <option value="SECURITY">SECURITY · 보안</option>
                <option value="LEGAL">LEGAL · 법적 요청</option>
                <option value="CONTENT_POLICY">CONTENT_POLICY · 콘텐츠 정책</option>
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
              authority="allowed"
              state={pending ? "pending" : "ready"}
              primary={
                <button type="button" className="btn btn-primary" disabled={pending} onClick={confirm}>
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
                <Detail label="커밋 시각" value={receiptState.receipt.createdAt} />
              </dl>
              <p className="body">{remoteCopyLimitationLabel(receiptState.receipt.limitationCode)}</p>
            </section>

            <AdminReceiptTimeline
              level="L3"
              receiptId={`영수증 ${receiptState.receipt.receiptId}`}
              entries={[
                {
                  key: "origin",
                  label: `원본 접근 차단 완료 · generation ${receiptState.convergence.committedGeneration}`,
                  state: "succeeded",
                },
                ...receiptState.convergence.attempts.map((attempt) => ({
                  key: `attempt-${attempt.attemptNo}`,
                  label: `시도 ${attempt.attemptNo} · ${attempt.status}${attempt.resultCategory ? ` · ${attempt.resultCategory}` : ""}`,
                  state: attempt.status === "SUCCEEDED" ? "succeeded" as const : attempt.status === "FAILED" ? "failed" as const : "pending" as const,
                  occurredAt: attempt.observedAt,
                })),
              ]}
              convergence={
                <section className="surface" role="region" aria-label="전파 수렴 타임라인">
                  <p className="eyebrow">Convergence</p>
                  <h2 className="h4 editorial">전파 수렴 타임라인</h2>
                  <p className="body">원본 접근 차단과 CDN 전파는 서로 독립된 결과입니다.</p>
                  <ol>
                    <li><strong>원본 접근 차단 완료</strong> · generation {receiptState.convergence.committedGeneration}</li>
                    {receiptState.convergence.attempts.map((attempt) => (
                      <li key={attempt.attemptNo}>
                        <strong>시도 {attempt.attemptNo}</strong> · {attempt.status}
                        {attempt.resultCategory ? ` · ${attempt.resultCategory}` : ""} · {attempt.observedAt}
                      </li>
                    ))}
                  </ol>
                  {receiptState.convergence.status === "PENDING" ? <p role="status">전파 상태를 확인하고 있습니다.</p> : null}
                  {receiptState.convergence.status === "FAILED" ? <p role="alert">원본은 차단됐지만 전파 시도가 완료되지 않았습니다.</p> : null}
                  {receiptState.convergence.retryable ? (
                    <AdminSafeActionDock
                      level="L3"
                      authority="allowed"
                      state={pending ? "pending" : "ready"}
                      primary={
                        <button type="button" className="btn btn-secondary" disabled={pending} onClick={onRetryConvergence}>
                          {pending ? "전파 재시도 요청 중…" : "전파 다시 시도"}
                        </button>
                      }
                    />
                  ) : null}
                  {error ? <p role="alert" className="danger">{error}</p> : null}
                </section>
              }
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
