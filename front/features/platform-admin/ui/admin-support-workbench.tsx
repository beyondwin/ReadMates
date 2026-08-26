import type {
  AdminSupportGrantLedgerItem,
  AdminSupportGrantPreview,
  AdminSupportGrantReceipt,
  AdminSupportSearchResult,
  SupportGrantReasonCategory,
  SupportGrantStatus,
} from "@/features/platform-admin/model/platform-admin-support-model";
import { AdminReceiptTimeline } from "./admin-receipt-timeline";

export type AdminSupportWorkbenchClub = { clubId: string; name: string };

type PreviewState = {
  preview: AdminSupportGrantPreview | null;
  receipt: AdminSupportGrantReceipt | null;
  recovery: string | null;
  previewPending: boolean;
  confirmPending: boolean;
  outcomeUnknown: boolean;
};

export type AdminSupportWorkbenchProps = {
  clubs: AdminSupportWorkbenchClub[];
  selectedClubId: string | null;
  status: SupportGrantStatus | "";
  canManage: boolean;
  latestReceipt: AdminSupportGrantReceipt | null;
  search: {
    query: string;
    results: AdminSupportSearchResult[];
    selected: AdminSupportSearchResult | null;
    hasSearched: boolean;
    pending: boolean;
    error: string | null;
    onQueryChange: (value: string) => void;
    onSubmit: () => void;
    onSelect: (result: AdminSupportSearchResult) => void;
    onClear: () => void;
  };
  create: PreviewState & {
    reasonCategory: SupportGrantReasonCategory;
    note: string;
    expiresAt: string;
    onReasonCategoryChange: (value: SupportGrantReasonCategory) => void;
    onNoteChange: (value: string) => void;
    onExpiresAtChange: (value: string) => void;
    onPreview: () => void;
    onConfirm: () => void;
    onReset: () => void;
  };
  ledger: {
    items: AdminSupportGrantLedgerItem[];
    pending: boolean;
    error: string | null;
    nextPageError: boolean;
    hasNextPage: boolean;
    loadingMore: boolean;
    onRetry: () => void;
    onLoadMore: () => void;
  };
  revoke: PreviewState & {
    target: AdminSupportGrantLedgerItem | null;
    reasonCategory: SupportGrantReasonCategory;
    note: string;
    onStart: (grant: AdminSupportGrantLedgerItem) => void;
    onCancel: () => void;
    onReasonCategoryChange: (value: SupportGrantReasonCategory) => void;
    onNoteChange: (value: string) => void;
    onPreview: () => void;
    onConfirm: () => void;
  };
  onClubChange: (clubId: string) => void;
  onStatusChange: (status: SupportGrantStatus | "") => void;
};

const REASON_OPTIONS: ReadonlyArray<{ value: SupportGrantReasonCategory; label: string }> = [
  { value: "INCIDENT_INVESTIGATION", label: "사고 조사" },
  { value: "MEMBER_ASSISTANCE", label: "회원 지원" },
  { value: "DATA_CORRECTION", label: "데이터 정정" },
  { value: "SECURITY_REVIEW", label: "보안 검토" },
];

export function AdminSupportWorkbench(props: AdminSupportWorkbenchProps) {
  const effectPending = props.create.confirmPending || props.revoke.confirmPending;
  const effectLocked = effectPending || props.create.outcomeUnknown || props.revoke.outcomeUnknown;
  const createLocked = effectLocked || props.create.preview !== null;

  return (
    <section className="admin-support-workbench" aria-labelledby="admin-support-title">
      <header className="admin-support-workbench__header">
        <div>
          <h1 id="admin-support-title" className="h1 editorial">지원</h1>
          <p className="body">민감한 대상 정보는 이 화면을 떠나면 즉시 폐기됩니다.</p>
        </div>
        <div className="admin-support-workbench__filters">
          <label className="field-group">
            <span className="label">클럽</span>
            <select className="input" value={props.selectedClubId ?? ""} disabled={effectLocked} onChange={(event) => props.onClubChange(event.currentTarget.value)}>
              <option value="">전체</option>
              {props.clubs.map((club) => <option key={club.clubId} value={club.clubId}>{club.name}</option>)}
            </select>
          </label>
          <label className="field-group">
            <span className="label">권한 상태</span>
            <select className="input" value={props.status} disabled={effectLocked} onChange={(event) => props.onStatusChange(event.currentTarget.value as SupportGrantStatus | "")}>
              <option value="">전체</option>
              <option value="ACTIVE">활성</option>
              <option value="EXPIRING">곧 만료</option>
              <option value="EXPIRED">만료</option>
              <option value="REVOKED">취소</option>
            </select>
          </label>
        </div>
      </header>

      {!props.canManage ? <p className="admin-support-workbench__notice">현재 권한으로는 지원 접근 권한을 변경할 수 없습니다.</p> : null}
      {props.latestReceipt ? (
        <>
          <ReceiptSummary receipt={props.latestReceipt} />
          <SupportReceiptTimeline receipt={props.latestReceipt} />
        </>
      ) : null}

      <section className="admin-support-workbench__panel" aria-labelledby="support-search-title">
        <h2 id="support-search-title" className="h3 editorial">지원 대상 검색</h2>
        <form className="admin-support-workbench__search" onSubmit={(event) => { event.preventDefault(); props.search.onSubmit(); }}>
          <label className="field-group admin-support-workbench__search-field">
            <span className="label">지원 대상 검색</span>
            <input type="search" className="input" value={props.search.query} disabled={effectLocked} onChange={(event) => props.search.onQueryChange(event.currentTarget.value)} placeholder="이름 또는 이메일" />
          </label>
          <button type="submit" className="btn btn-primary btn-sm" disabled={effectLocked || props.search.pending || !props.search.query.trim()}>검색</button>
          {props.search.query || props.search.selected ? <button type="button" className="btn btn-ghost btn-sm" disabled={effectLocked} onClick={props.search.onClear}>선택 해제</button> : null}
        </form>
        {props.search.error ? <p className="danger" role="alert">{props.search.error}</p> : null}
        {props.search.pending ? <p className="muted">지원 대상을 검색하는 중입니다.</p> : props.search.results.length > 0 ? (
          <div className="admin-support-workbench__results">
            {props.search.results.map((result) => (
              <button key={result.subjectId} type="button" disabled={effectLocked} onClick={() => props.search.onSelect(result)}>
                <strong>{result.displayName}</strong><span>{result.maskedEmail}</span><em>{result.grantEligible ? result.platformAdminRole ?? result.kind : result.grantBlockedReason ?? "발급 불가"}</em>
              </button>
            ))}
          </div>
        ) : props.search.hasSearched ? <p className="muted">검색 결과가 없습니다.</p> : <p className="muted">이름 또는 이메일로 지원 대상을 검색하세요.</p>}
      </section>

      {props.search.selected ? (
        <section className="admin-support-workbench__panel" aria-labelledby="support-grant-title">
          <div className="admin-support-workbench__section-heading">
            <div><h2 id="support-grant-title" className="h3 editorial">지원 접근 권한 발급</h2><p className="small muted">{props.search.selected.displayName} · {props.search.selected.maskedEmail}</p></div>
            {props.create.receipt ? <button type="button" className="btn btn-ghost btn-sm" onClick={props.create.onReset}>새 발급</button> : null}
          </div>
          <CommandFields
            categoryLabel="선택 사유"
            noteLabel="검토 시에만 확인하는 사유 메모 (저장되지 않음)"
            reasonCategory={props.create.reasonCategory}
            note={props.create.note}
            expiresAt={props.create.expiresAt}
            locked={createLocked || props.create.receipt !== null}
            onReasonCategoryChange={props.create.onReasonCategoryChange}
            onNoteChange={props.create.onNoteChange}
            onExpiresAtChange={props.create.onExpiresAtChange}
          />
          {props.create.preview ? <PreviewSummary preview={props.create.preview} /> : null}
          {props.create.receipt ? <ReceiptSummary receipt={props.create.receipt} /> : null}
          {props.create.recovery ? <p className="danger" role="alert">{props.create.recovery}</p> : null}
          {!props.create.receipt ? (
            <div className="admin-support-workbench__command-actions">
              {props.create.preview ? (
                <button type="button" className="btn btn-primary btn-sm" disabled={!props.canManage || props.create.confirmPending} onClick={props.create.onConfirm}>{props.create.confirmPending ? "결과 확인 중" : "발급 확정"}</button>
              ) : (
                <button type="button" className="btn btn-primary btn-sm" disabled={!props.canManage || !props.search.selected.grantEligible || props.create.previewPending || !props.create.expiresAt} onClick={props.create.onPreview}>{props.create.previewPending ? "검토 중" : "발급 검토"}</button>
              )}
            </div>
          ) : null}
        </section>
      ) : null}

      <section className="admin-support-workbench__panel" aria-labelledby="support-ledger-title">
        <h2 id="support-ledger-title" className="h3 editorial">지원 접근 권한 이력</h2>
        {props.ledger.error && !props.ledger.nextPageError ? <div role="alert"><p className="danger">{props.ledger.error}</p><button className="btn btn-ghost btn-sm" type="button" onClick={props.ledger.onRetry}>다시 시도</button></div> : props.ledger.pending ? <p className="muted">이력을 불러오는 중입니다.</p> : props.ledger.items.length === 0 ? <p className="muted">조건에 맞는 지원 접근 권한이 없습니다.</p> : (
          <div className="admin-support-workbench__ledger">
            {props.ledger.items.map((item) => (
              <article key={item.grantId} className="admin-support-workbench__ledger-row">
                <div><p><strong>{item.clubName}</strong> · {item.granteeDisplayName}</p><p className="small muted">{item.granteeMaskedEmail} · {item.status} · {item.reasonCategory} · {notePresenceLabel(item.notePresent)}</p></div>
                {props.canManage && item.status === "ACTIVE" ? <button type="button" className="btn btn-ghost btn-sm" disabled={effectLocked} onClick={() => props.revoke.onStart(item)}>권한 취소 검토</button> : null}
              </article>
            ))}
          </div>
        )}
        {props.ledger.hasNextPage ? <div className="admin-support-workbench__load-more">{props.ledger.nextPageError ? <p className="danger" role="alert">다음 이력을 불러오지 못했습니다. 현재 목록은 유지됩니다.</p> : null}<button type="button" className="btn btn-ghost btn-sm" disabled={props.ledger.loadingMore} onClick={props.ledger.onLoadMore}>{props.ledger.loadingMore ? "불러오는 중" : props.ledger.nextPageError ? "다시 불러오기" : "더 보기"}</button></div> : null}
      </section>

      {props.revoke.target ? (
        <section className="admin-support-workbench__panel" aria-labelledby="support-revoke-title">
          <div className="admin-support-workbench__section-heading"><div><h2 id="support-revoke-title" className="h3 editorial">지원 접근 권한 취소</h2><p className="small muted">{props.revoke.target.clubName} · {props.revoke.target.granteeDisplayName}</p></div><button type="button" className="btn btn-ghost btn-sm" disabled={props.revoke.confirmPending || props.revoke.outcomeUnknown} onClick={props.revoke.onCancel}>닫기</button></div>
          <CommandFields categoryLabel="취소 사유" noteLabel="검토 시에만 확인하는 사유 메모 (저장되지 않음)" reasonCategory={props.revoke.reasonCategory} note={props.revoke.note} locked={props.revoke.preview !== null || props.revoke.confirmPending || props.revoke.receipt !== null} onReasonCategoryChange={props.revoke.onReasonCategoryChange} onNoteChange={props.revoke.onNoteChange} />
          {props.revoke.preview ? <PreviewSummary preview={props.revoke.preview} /> : null}
          {props.revoke.receipt ? <ReceiptSummary receipt={props.revoke.receipt} /> : null}
          {props.revoke.recovery ? <p className="danger" role="alert">{props.revoke.recovery}</p> : null}
          {!props.revoke.receipt ? <div className="admin-support-workbench__command-actions"><button type="button" className="btn btn-primary btn-sm" disabled={!props.canManage || props.revoke.previewPending || props.revoke.confirmPending} onClick={props.revoke.preview ? props.revoke.onConfirm : props.revoke.onPreview}>{props.revoke.preview ? props.revoke.confirmPending ? "결과 확인 중" : "취소 확정" : props.revoke.previewPending ? "검토 중" : "취소 검토"}</button></div> : null}
        </section>
      ) : null}
    </section>
  );
}

function CommandFields(props: {
  categoryLabel: string;
  noteLabel: string;
  reasonCategory: SupportGrantReasonCategory;
  note: string;
  expiresAt?: string;
  locked: boolean;
  onReasonCategoryChange: (value: SupportGrantReasonCategory) => void;
  onNoteChange: (value: string) => void;
  onExpiresAtChange?: (value: string) => void;
}) {
  return <div className="admin-support-workbench__command-fields">
    <label className="field-group"><span className="label">{props.categoryLabel}</span><select className="input" value={props.reasonCategory} disabled={props.locked} onChange={(event) => props.onReasonCategoryChange(event.currentTarget.value as SupportGrantReasonCategory)}>{REASON_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
    <label className="field-group"><span className="label">{props.noteLabel}</span><textarea className="input" value={props.note} disabled={props.locked} maxLength={500} onChange={(event) => props.onNoteChange(event.currentTarget.value)} /></label>
    {props.expiresAt !== undefined ? <label className="field-group"><span className="label">만료 시각</span><input className="input" type="datetime-local" value={props.expiresAt} disabled={props.locked} onChange={(event) => props.onExpiresAtChange?.(event.currentTarget.value)} /></label> : null}
  </div>;
}

function PreviewSummary({ preview }: { preview: AdminSupportGrantPreview }) {
  return <section className="admin-support-workbench__review" aria-label="변경 검토"><p><strong>{preview.commandType === "CREATE" ? "발급" : "취소"} 영향</strong></p><ul>{preview.impactCodes.map((code) => <li key={code}>{code}</li>)}</ul><p className="small muted">사유 {preview.reasonCategory} · {notePresenceLabel(preview.notePresent)} · 검토 만료 {preview.expiresAt}</p></section>;
}

function ReceiptSummary({ receipt }: { receipt: AdminSupportGrantReceipt }) {
  return <section className="admin-support-workbench__receipt" aria-label="명령 영수증"><p><strong>처리 완료</strong> · {receipt.outcome}</p><p className="small muted">영수증 {receipt.receiptId} · {receipt.beforeStatus} → {receipt.afterStatus}</p><p className="small muted">{receipt.reasonCategory} · {notePresenceLabel(receipt.notePresent)}</p></section>;
}

function SupportReceiptTimeline({ receipt }: { receipt: AdminSupportGrantReceipt }) {
  return (
    <AdminReceiptTimeline
      level="L2"
      receiptId={`영수증 ${receipt.receiptId}`}
      entries={[
        {
          key: "command",
          label: `${receipt.commandType === "CREATE" ? "발급" : "취소"} ${receipt.outcome}`,
          state: receipt.outcome === "SUCCEEDED" ? "succeeded" : "failed",
          occurredAt: receipt.createdAt,
          detail: `${receipt.beforeStatus} → ${receipt.afterStatus} · ${receipt.reasonCategory} · ${notePresenceLabel(receipt.notePresent)}`,
        },
      ]}
    />
  );
}

function notePresenceLabel(notePresent: boolean) {
  return notePresent ? "검토 시 사유 메모 사용" : "검토 시 사유 메모 없음";
}
