import type { ComponentType, ReactNode } from "react";
import { loginPathForReturnTo } from "@/shared/auth/login-return";

type GuestLinkProps = {
  to: string;
  className?: string;
  children: ReactNode;
};

type GuestAccountControlProps = {
  clubSlug: string;
  returnTo: string;
  LinkComponent: ComponentType<GuestLinkProps>;
};

export function GuestAccountControl({ clubSlug, returnTo, LinkComponent }: GuestAccountControlProps) {
  const publicHomePath = `/clubs/${encodeURIComponent(clubSlug)}`;

  return (
    <div className="rm-guest-account-control" aria-label="게스트 계정">
      <span className="rm-guest-account-control__badge">게스트</span>
      <LinkComponent className="rm-guest-account-control__action" to={loginPathForReturnTo(returnTo)}>
        멤버로 시작
      </LinkComponent>
      <LinkComponent className="rm-guest-account-control__action" to={publicHomePath}>
        공개 홈으로 나가기
      </LinkComponent>
    </div>
  );
}
