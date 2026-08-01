type MemberSpaceUtilityNavProps = {
  notificationsHref: string;
  settingsHref: string;
};

type UtilityLinkProps = {
  href: string;
  label: string;
  description: string;
};

function UtilityLink({ href, label, description }: UtilityLinkProps) {
  return (
    <a className="rm-member-space-utilities__link" href={href}>
      <span>
        <span className="rm-member-space-utilities__label">{label}</span>
        <span className="rm-member-space-utilities__description">{description}</span>
      </span>
      <span className="rm-member-space-utilities__chevron" aria-hidden="true">›</span>
    </a>
  );
}

export function MemberSpaceUtilityNav({
  notificationsHref,
  settingsHref,
}: MemberSpaceUtilityNavProps) {
  return (
    <section className="rm-member-space-utilities" aria-labelledby="member-space-utilities-heading">
      <p className="rm-member-space-kicker">내 공간 관리</p>
      <h2 id="member-space-utilities-heading" className="rm-sr-only">내 공간 관리</h2>
      <div className="rm-member-space-utilities__list">
        <UtilityLink
          href={notificationsHref}
          label="알림"
          description="받은 알림과 수신 설정"
        />
        <UtilityLink
          href={settingsHref}
          label="계정 설정"
          description="프로필과 멤버십 정보"
        />
      </div>
    </section>
  );
}
