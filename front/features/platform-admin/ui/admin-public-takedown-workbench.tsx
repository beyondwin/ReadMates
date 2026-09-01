import { useState, type FormEvent } from "react";
import {
  normalizeTakedownReason,
  remoteCopyLimitationLabel,
  takedownReasonRecordLabel,
  takedownReceiptOutcomePresentation,
  type AdminTakedownState,
  type TakedownPreviewRequest,
  type TakedownReasonCategory,
} from "../model/platform-admin-takedown-model";
import { ADMIN_COPY } from "../model/admin-copy";
import { AdminPageContext } from "./admin-page-context";
import { AdminReceiptTimeline } from "./admin-receipt-timeline";
import { AdminSafeActionDock, type AdminSafeActionState } from "./admin-action-dock";
import { AdminTechnicalDisclosure } from "./admin-technical-disclosure";
import "./admin-emergency-lane.css";

type ConfirmInput = { reasonCategory: TakedownReasonCategory; reason: string };

type DesktopHandoff = {
  href: string;
  status: "idle" | "copying" | "copied" | "failed";
  onCopy: () => void;
};

type Props = {
  canOperate: boolean;
  state: AdminTakedownState;
  pending: boolean;
  error: string | null;
  desktopHandoff: DesktopHandoff;
  onPreview: (target: TakedownPreviewRequest) => void;
  onConfirm: (input: ConfirmInput) => void;
};

export function AdminPublicTakedownWorkbench({
  canOperate,
  state,
  pending,
  error,
  desktopHandoff,
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
      <div className="admin-emergency-lane admin-public-takedown">
        <AdminPageContext
          eyebrow={ADMIN_COPY.eyebrow.takedown}
          heading="긴급 공개 회수"
          description="공개된 기록의 원본 접근을 차단하고 캐시 회수 작업을 시작하는 비상 절차입니다."
          authority="실행 권한 없음"
        >
          <section className="admin-emergency-lane__notice" aria-label="긴급 공개 회수 권한 안내">
            <h2 className="h4 editorial">이 작업을 실행할 권한이 없습니다.</h2>
            <p className="body muted">허용된 운영 공간으로 돌아가거나 권한을 가진 운영자에게 요청해 주세요.</p>
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
    <div className="admin-emergency-lane admin-public-takedown">
      <AdminPageContext
        eyebrow={ADMIN_COPY.eyebrow.takedown}
        heading="긴급 공개 회수"
        description="공개된 기록의 원본 접근을 차단하고 캐시 회수 작업을 시작하는 비상 절차입니다. 대상과 영향을 차례로 확인한 뒤 실행하세요."
        authority="긴급 회수 실행 가능"
      >
        <section className="admin-emergency-lane__compact-handoff" role="region" aria-label="데스크톱에서 이어서 처리">
          <p className="admin-emergency-lane__step">권장 작업 환경</p>
          <h2 className="h4 editorial">데스크톱에서 이어서 처리하세요</h2>
          <p className="body">
            여러 식별자와 회수 범위를 함께 대조해야 합니다. 현재 주소를 복사해 같은 계정으로 데스크톱에서 여는 것을 권장합니다.
          </p>
          <AdminSafeActionDock
            level="L3"
            authority="allowed"
            state="ready"
            status={desktopHandoff.status === "copied" ? <p role="status">주소를 복사했습니다.</p> : desktopHandoff.status === "failed" ? <p role="status">주소를 복사하지 못했습니다. 아래 경로를 직접 열어 주세요.</p> : null}
            primary={
              <button type="button" className="btn btn-primary" disabled={desktopHandoff.status === "copying"} onClick={desktopHandoff.onCopy}>
                {desktopHandoff.status === "copying" ? "주소 복사 중…" : "데스크톱용 주소 복사"}
              </button>
            }
            secondary={<a href="#takedown-direct-workflow">이 기기에서 계속 검토</a>}
          />
          <p className="tiny muted">데스크톱 경로 · <code>{desktopHandoff.href}</code></p>
        </section>

        <section id="takedown-direct-workflow" className="admin-emergency-lane__direct-workflow" role="region" aria-label="이 기기에서 직접 처리">
          {state.kind === "idle" ? (
            <form className="admin-emergency-lane__target-form" aria-label="긴급 공개 회수 대상" onSubmit={submitPreview}>
              <div className="admin-emergency-lane__section-heading">
                <p className="admin-emergency-lane__step">1 · 대상 확인</p>
                <h2 className="h4 editorial">회수할 공개 기록을 고정하세요</h2>
                <p className="body muted">클럽·모임·공개 기록 식별자를 정확히 입력한 뒤 서버가 고정한 대상을 다시 검토합니다.</p>
              </div>
              <div className="admin-emergency-lane__target-grid">
                <IdField label="클럽 ID" value={clubId} onChange={setClubId} />
                <IdField label="모임 ID" value={sessionId} onChange={setSessionId} />
                <IdField label="공개 기록 ID" value={publicationId} onChange={setPublicationId} />
              </div>
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
            <section className="admin-emergency-lane__review" aria-labelledby="takedown-preview-title">
              <div className="admin-emergency-lane__section-heading">
                <p className="admin-emergency-lane__step">2 · 영향과 실행</p>
                <h2 id="takedown-preview-title" className="h4 editorial">회수 대상을 마지막으로 확인하세요</h2>
                <p className="body">서버가 대상과 현재 공개 범위를 고정했습니다. 아래 한계와 사유를 확인한 뒤 원본 접근을 차단합니다.</p>
              </div>

              <section className="admin-emergency-lane__impact" aria-labelledby="takedown-impact-title">
                <h3 id="takedown-impact-title" className="h6 editorial">영향과 한계</h3>
                <p className="body">현재 공개 경로 {state.preview.currentSurfaces.length}곳을 기준으로 회수 절차를 준비했습니다.</p>
                <p className="body">{remoteCopyLimitationLabel(state.preview.remoteCopyLimitation)}</p>
                {!state.preview.confirmEnabled ? <p className="admin-emergency-lane__blocked">안전 활성화 조건이 아직 충족되지 않았습니다.</p> : null}
              </section>

              <section className="admin-emergency-lane__reason" aria-labelledby="takedown-reason-title">
                <h3 id="takedown-reason-title" className="h6 editorial">사유를 기록하세요</h3>
                <label className="field-group">
                  <span className="label">사유 분류</span>
                  <select className="input" value={reasonCategory} onChange={(event) => setReasonCategory(event.target.value as TakedownReasonCategory)}>
                    <option value="PRIVATE_DATA">개인정보</option>
                    <option value="LEGAL_REQUEST">법적 요청</option>
                    <option value="SECURITY_INCIDENT">보안 사고</option>
                    <option value="PUBLIC_SAFETY">공공 안전</option>
                  </select>
                </label>
                <label className="field-group">
                  <span className="label">회수 사유</span>
                  <textarea className="input" value={reason} onChange={(event) => setReason(event.target.value)} rows={4} />
                </label>
              </section>

              <AdminTechnicalDisclosure items={previewTechnicalItems(state.preview)} />
              {validationError ? <p role="alert" className="danger">{validationError}</p> : null}
              {error ? <p role="alert" className="danger">{error}</p> : null}
              <AdminSafeActionDock
                level="L3"
                authority={state.preview.confirmEnabled ? "allowed" : "denied"}
                state={state.preview.confirmEnabled ? (pending ? "pending" : "ready") : "forbidden"}
                reason={!state.preview.confirmEnabled ? "현재는 실행할 수 없습니다. 기술 정보에서 활성화 조건을 확인하세요." : undefined}
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
              <section className="admin-emergency-lane__receipt" role="region" aria-label="변경 불가 회수 영수증">
                <p className="admin-emergency-lane__step">3 · 처리 결과</p>
                <h2 className="h4 editorial">원본 공개 경로를 차단했습니다.</h2>
                <p className="body">회수 명령과 공개 캐시 반영 결과가 변경 불가 영수증에 기록되었습니다.</p>
                <p className="body">{takedownReasonRecordLabel(receiptState.receipt.reasonRedacted)}</p>
                <p className="body">{remoteCopyLimitationLabel(receiptState.receipt.remoteCopyLimitation)}</p>
                <AdminTechnicalDisclosure items={receiptTechnicalItems(receiptState.receipt)} />
              </section>

              <AdminReceiptTimeline
                level="L3"
                receiptId="변경 불가 처리 영수증"
                entries={receiptTimelineEntries(receiptState.receipt)}
              />
              <AdminSafeActionDock level="L3" authority="allowed" state={dockState} />
            </>
          ) : null}
        </section>
      </AdminPageContext>
    </div>
  );
}

function takedownDockState({ pending, receipt }: { pending: boolean; receipt: boolean }): AdminSafeActionState {
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

function previewTechnicalItems(preview: Extract<AdminTakedownState, { kind: "preview" | "confirming" }>["preview"]) {
  return [
    { label: "미리보기 ID", value: preview.previewId },
    { label: "만료 시각", value: preview.expiresAt },
    { label: "클럽 ID", value: preview.clubId },
    { label: "모임 ID", value: preview.sessionId },
    { label: "공개 기록 ID", value: preview.publicationId },
    { label: "대상 generation", value: String(preview.targetGeneration) },
    { label: "공개 surface", value: preview.currentSurfaces.join(", ") },
    { label: "활성화 경계", value: preview.activationBoundary },
  ];
}

function receiptTechnicalItems(receipt: Extract<AdminTakedownState, { kind: "origin-denied" }>["receipt"]) {
  return [
    { label: "영수증 ID", value: receipt.receiptId },
    { label: "수렴 ID", value: receipt.convergenceId },
    { label: "클럽 ID", value: receipt.clubId },
    { label: "모임 ID", value: receipt.sessionId },
    { label: "공개 기록 ID", value: receipt.publicationId },
    { label: "원본 결과", value: receipt.originResult },
    { label: "커밋 generation", value: String(receipt.committedGeneration) },
    { label: "사유 분류", value: receipt.reasonCategory },
    { label: "사유 본문 비공개", value: receipt.reasonRedacted ? "예" : "아니요" },
    { label: "BFF eviction", value: receipt.bffEvictionOutcome },
    { label: "CDN purge", value: receipt.cdnPurgeOutcome },
    { label: "브라우저 재검증", value: receipt.browserRevalidationOutcome },
    { label: "커밋 시각", value: receipt.createdAt },
  ];
}

function receiptTimelineEntries(
  receipt: Extract<AdminTakedownState, { kind: "origin-denied" }>["receipt"],
) {
  const bff = takedownReceiptOutcomePresentation("bff", receipt.bffEvictionOutcome);
  const cdn = takedownReceiptOutcomePresentation("cdn", receipt.cdnPurgeOutcome);
  const browser = takedownReceiptOutcomePresentation("browser", receipt.browserRevalidationOutcome);
  return [
    { key: "origin", label: "원본 접근 차단 완료", state: "succeeded" as const },
    { key: "bff", ...bff },
    { key: "cdn", ...cdn },
    { key: "browser", ...browser },
  ];
}
