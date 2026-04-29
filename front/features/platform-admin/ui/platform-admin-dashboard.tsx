type PlatformAdminDomainStatus =
  | "REQUESTED"
  | "ACTION_REQUIRED"
  | "PROVISIONING"
  | "ACTIVE"
  | "FAILED"
  | "DISABLED";

type PlatformAdminDomainView = {
  id: string;
  clubId: string;
  hostname: string;
  kind: string;
  status: PlatformAdminDomainStatus;
  desiredState: string;
  manualAction: string;
  errorCode: string | null;
  isPrimary: boolean;
  verifiedAt: string | null;
  lastCheckedAt: string | null;
};

type PlatformAdminSummaryView = {
  platformRole: string;
  activeClubCount: number;
  domainActionRequiredCount: number;
  domains?: PlatformAdminDomainView[];
  domainsRequiringAction?: PlatformAdminDomainView[];
};

type PlatformAdminDashboardProps = {
  summary: PlatformAdminSummaryView;
  checkingDomainIds?: ReadonlySet<string>;
  domainCheckErrors?: Record<string, string>;
  onCheckDomain?: (domainId: string) => void;
};

export function PlatformAdminDashboard({
  summary,
  checkingDomainIds = new Set<string>(),
  domainCheckErrors = {},
  onCheckDomain,
}: PlatformAdminDashboardProps) {
  const domains = summary.domains ?? summary.domainsRequiringAction ?? [];

  return (
    <main className="platform-admin-page">
      <section className="container platform-admin-page__inner" aria-labelledby="platform-admin-title">
        <div className="platform-admin-page__header">
          <p className="eyebrow">ReadMates Admin</p>
          <h1 id="platform-admin-title" className="h1 editorial">
            플랫폼 관리
          </h1>
        </div>

        <section className="platform-admin-summary" aria-label="플랫폼 요약">
          <MetricCard label="플랫폼 역할" value={summary.platformRole} />
          <MetricCard label="활성 클럽" value={summary.activeClubCount.toLocaleString("ko-KR")} />
          <MetricCard label="도메인 조치 필요" value={summary.domainActionRequiredCount.toLocaleString("ko-KR")} />
        </section>

        <section className="platform-admin-domains" aria-labelledby="platform-admin-domains-title">
          <div className="platform-admin-domains__header">
            <div>
              <p className="eyebrow">Domain provisioning</p>
              <h2 id="platform-admin-domains-title" className="h3 editorial">
                Cloudflare Pages custom domain
              </h2>
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
                  onCheckDomain={onCheckDomain}
                />
              ))}
            </div>
          ) : (
            <p className="muted platform-admin-domain-empty">등록된 도메인이 없습니다.</p>
          )}
        </section>
      </section>
    </main>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <article className="surface platform-admin-metric">
      <p className="tiny muted platform-admin-metric__label">{label}</p>
      <p className="editorial platform-admin-metric__value">{value}</p>
    </article>
  );
}

function DomainProvisioningRow({
  domain,
  isChecking,
  checkError,
  onCheckDomain,
}: {
  domain: PlatformAdminDomainView;
  isChecking: boolean;
  checkError?: string;
  onCheckDomain?: (domainId: string) => void;
}) {
  const canCheck = domain.status !== "ACTIVE" && domain.status !== "DISABLED" && Boolean(onCheckDomain);

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
        <p className="platform-admin-domain-row__action">Cloudflare Pages custom domain 연결 후 상태 확인을 실행하세요.</p>
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
