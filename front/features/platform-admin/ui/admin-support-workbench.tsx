import type {
  AdminSupportGrantLedgerItem,
  AdminSupportSearchResult,
} from "@/features/platform-admin/model/platform-admin-support-model";

export type AdminSupportWorkbenchClub = {
  clubId: string;
  name: string;
};

export type AdminSupportWorkbenchProps = {
  clubs: AdminSupportWorkbenchClub[];
  selectedClubId: string | null;
  query: string;
  results: AdminSupportSearchResult[];
  selectedResult: AdminSupportSearchResult | null;
  ledger: AdminSupportGrantLedgerItem[];
  reason: string;
  expiresAt: string;
  busy: boolean;
  error: string | null;
  canCreateGrant: boolean;
  onQueryChange: (value: string) => void;
  onSearch: () => Promise<void>;
  onSelectResult: (result: AdminSupportSearchResult) => void;
  onClubChange: (clubId: string) => void;
  onReasonChange: (value: string) => void;
  onExpiresAtChange: (value: string) => void;
  onCreateGrant: () => Promise<void>;
  onRevokeGrant: (grantId: string) => Promise<void>;
};

export function AdminSupportWorkbench(props: AdminSupportWorkbenchProps) {
  const createDisabled =
    !props.selectedResult?.grantEligible ||
    !props.selectedClubId ||
    !props.reason.trim() ||
    !props.expiresAt ||
    !props.canCreateGrant ||
    props.busy;

  return (
    <section className="admin-support-workbench" aria-labelledby="admin-support-title">
      <header className="admin-support-workbench__header">
        <h1 id="admin-support-title" className="h1 editorial">지원</h1>
        <label className="field-group">
          <span className="label">클럽</span>
          <select className="input" value={props.selectedClubId ?? ""} onChange={(event) => props.onClubChange(event.currentTarget.value)}>
            <option value="">전체</option>
            {props.clubs.map((club) => (
              <option key={club.clubId} value={club.clubId}>{club.name}</option>
            ))}
          </select>
        </label>
      </header>

      {props.error ? <p className="admin-support-workbench__error" role="alert">{props.error}</p> : null}

      <section className="admin-support-workbench__panel" aria-labelledby="support-search-title">
        <h2 id="support-search-title" className="h3 editorial">지원 대상 검색</h2>
        <form className="admin-support-workbench__search" onSubmit={(event) => {
          event.preventDefault();
          void props.onSearch();
        }}>
          <input
            className="input"
            value={props.query}
            onChange={(event) => props.onQueryChange(event.currentTarget.value)}
            placeholder="이름 또는 이메일"
          />
          <button type="submit" className="btn btn-primary btn-sm" disabled={props.busy || !props.query.trim()}>
            검색
          </button>
        </form>
        {props.results.length > 0 ? (
          <div className="admin-support-workbench__results">
            {props.results.map((result) => (
              <button key={result.subjectId} type="button" onClick={() => props.onSelectResult(result)}>
                <strong>{result.displayName}</strong>
                <span>{result.maskedEmail}</span>
                <em>{result.platformAdminRole ?? result.kind}</em>
              </button>
            ))}
          </div>
        ) : (
          <p className="muted">검색 결과가 없습니다.</p>
        )}
      </section>

      {props.selectedResult ? (
        <section className="admin-support-workbench__panel" aria-labelledby="support-grant-title">
          <h2 id="support-grant-title" className="h3 editorial">지원 접근 권한 발급</h2>
          <p className="tiny muted">
            대상: {props.selectedResult.displayName} · {props.selectedResult.maskedEmail}
          </p>
          {!props.canCreateGrant ? <p className="muted">현재 역할은 지원 접근 권한을 발급할 수 없습니다.</p> : null}
          {props.selectedResult.grantBlockedReason ? <p className="muted">{props.selectedResult.grantBlockedReason}</p> : null}
          <label className="field-group">
            <span className="label">사유</span>
            <input className="input" value={props.reason} onChange={(event) => props.onReasonChange(event.currentTarget.value)} />
          </label>
          <label className="field-group">
            <span className="label">만료 시각</span>
            <input
              className="input"
              type="datetime-local"
              value={props.expiresAt}
              onChange={(event) => props.onExpiresAtChange(event.currentTarget.value)}
            />
          </label>
          <button type="button" className="btn btn-primary btn-sm" disabled={createDisabled} onClick={() => void props.onCreateGrant()}>
            발급
          </button>
        </section>
      ) : null}

      <section className="admin-support-workbench__panel" aria-labelledby="support-ledger-title">
        <h2 id="support-ledger-title" className="h3 editorial">지원 grant ledger</h2>
        {props.ledger.length > 0 ? (
          <div className="admin-support-workbench__ledger">
            {props.ledger.map((item) => (
              <article key={item.grantId} className="admin-support-workbench__ledger-row">
                <div>
                  <p>{item.clubName} · {item.granteeDisplayName}</p>
                  <p className="tiny muted">{item.granteeMaskedEmail} · {item.status} · {item.reason}</p>
                </div>
                {item.status === "ACTIVE" ? (
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => void props.onRevokeGrant(item.grantId)}>
                    권한 취소
                  </button>
                ) : null}
              </article>
            ))}
          </div>
        ) : (
          <p className="muted">활성 지원 접근 권한이 없습니다.</p>
        )}
      </section>
    </section>
  );
}
