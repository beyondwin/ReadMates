import type { ComponentType, ReactNode } from "react";
import { loginPathForReturnTo } from "@/shared/auth/login-return";

type GuestLinkProps = {
  to: string;
  className?: string;
  children: ReactNode;
};

export function GuestMySpace({ returnTo, LinkComponent }: { returnTo: string; LinkComponent: ComponentType<GuestLinkProps> }) {
  return (
    <main className="rm-guest-route container" aria-labelledby="guest-my-space-title">
      <section className="surface rm-guest-my-space">
        <p className="eyebrow">게스트 미리보기</p>
        <h1 id="guest-my-space-title" className="h1 editorial">
          내 공간
        </h1>
        <p className="body">멤버로 시작하면 내가 참석한 모임, 질문과 서평, 알림 설정을 이곳에서 이어볼 수 있어요.</p>
        <LinkComponent className="btn btn-primary rm-guest-my-space__action" to={loginPathForReturnTo(returnTo)}>
          멤버로 시작
        </LinkComponent>
      </section>
    </main>
  );
}
