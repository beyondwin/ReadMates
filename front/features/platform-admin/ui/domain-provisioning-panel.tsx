import type {
  PlatformAdminDomainStatus,
  PlatformAdminWorkbenchDomain,
} from "@/features/platform-admin/model/platform-admin-workbench-model";

type DomainProvisioningPanelProps = {
  domains: PlatformAdminWorkbenchDomain[];
  checkingDomainIds?: ReadonlySet<string>;
  domainCheckErrors?: Record<string, string>;
  canManageDomains: boolean;
  onCheckDomain?: (domainId: string) => void;
};

export function DomainProvisioningPanel({
  domains,
  checkingDomainIds = new Set<string>(),
  domainCheckErrors = {},
  canManageDomains,
  onCheckDomain,
}: DomainProvisioningPanelProps) {
  return (
    <section className="platform-admin-domains" aria-labelledby="platform-admin-domains-title">
      <div className="platform-admin-domains__header">
        <div>
          <p className="eyebrow">Domain provisioning</p>
          <h3 id="platform-admin-domains-title" className="h4 editorial">
            선택 클럽 도메인
          </h3>
        </div>
      </div>
      {domains.length > 0 ? (
        <div className="platform-admin-domain-list">
          {domains.map((domain) => (
            <DomainProvisioningRow
              key={domain.id}
              domain={domain}
              isChecking={checkingDomainIds.has(domain.id)}
              checkError={domainCheckErrors[domain.id]}
              canManageDomains={canManageDomains}
              onCheckDomain={onCheckDomain}
            />
          ))}
        </div>
      ) : (
        <p className="muted platform-admin-domain-empty">선택한 클럽에 등록된 도메인이 없습니다.</p>
      )}
    </section>
  );
}

function DomainProvisioningRow({
  domain,
  isChecking,
  checkError,
  canManageDomains,
  onCheckDomain,
}: {
  domain: PlatformAdminWorkbenchDomain;
  isChecking: boolean;
  checkError?: string;
  canManageDomains: boolean;
  onCheckDomain?: (domainId: string) => void;
}) {
  const canCheck =
    canManageDomains &&
    domain.status !== "ACTIVE" &&
    domain.status !== "DISABLED" &&
    Boolean(onCheckDomain);

  return (
    <article className="surface platform-admin-domain-row">
      <div className="platform-admin-domain-row__main">
        <p className="platform-admin-domain-row__hostname">{domain.hostname}</p>
        <p className="tiny muted">
          {domain.kind} · desired {domain.desiredState} · manual action {domain.manualAction}
        </p>
      </div>
      <div className="platform-admin-domain-row__status">
        <span className="platform-admin-domain-status">{domain.status}</span>
        {domain.errorCode ? <span className="tiny danger">{domain.errorCode}</span> : null}
      </div>
      {domain.status === "ACTION_REQUIRED" ? (
        <p className="platform-admin-domain-row__action">
          Cloudflare Pages custom domain 연결 후 상태 확인을 실행하세요.
        </p>
      ) : (
        <p className="platform-admin-domain-row__action">{domainActionText(domain.status)}</p>
      )}
      {canCheck ? (
        <button
          type="button"
          className="btn btn-ghost btn-sm platform-admin-domain-row__check"
          onClick={() => onCheckDomain?.(domain.id)}
          disabled={isChecking}
        >
          {isChecking ? "확인 중" : "상태 확인"}
        </button>
      ) : null}
      {checkError ? <p className="tiny danger platform-admin-domain-row__error">{checkError}</p> : null}
    </article>
  );
}

function domainActionText(status: PlatformAdminDomainStatus): string {
  switch (status) {
    case "REQUESTED":
      return "연결 작업을 시작하세요.";
    case "PROVISIONING":
      return "DNS와 인증서 발급 상태를 기다리고 있습니다.";
    case "ACTIVE":
      return "추가 조치 없음";
    case "FAILED":
      return "오류 코드를 확인하고 다시 검증하세요.";
    case "DISABLED":
      return "ReadMates에서 이 hostname을 받지 않습니다.";
    case "ACTION_REQUIRED":
      return "Cloudflare Pages custom domain 연결 후 상태 확인을 실행하세요.";
  }
}
