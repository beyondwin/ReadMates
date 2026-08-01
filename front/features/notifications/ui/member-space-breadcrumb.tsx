type MemberSpaceBreadcrumbProps = {
  mySpaceHref: string;
  currentLabel: string;
};

export function MemberSpaceBreadcrumb({
  mySpaceHref,
  currentLabel,
}: MemberSpaceBreadcrumbProps) {
  return (
    <nav className="rm-member-space-breadcrumb desktop-only" aria-label="현재 위치">
      <a href={mySpaceHref}>내 공간</a>
      <span aria-hidden="true">/</span>
      <span aria-current="page">{currentLabel}</span>
    </nav>
  );
}
