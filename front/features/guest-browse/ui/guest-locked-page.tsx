import type { ComponentType, ReactNode } from "react";
import { loginPathForReturnTo } from "@/shared/auth/login-return";

type GuestLinkProps = {
  to: string;
  className?: string;
  children: ReactNode;
};

export type GuestLockKind = "feedback" | "settings" | "notifications" | "member";

const lockCopy: Record<GuestLockKind, { title: string; description: string }> = {
  feedback: {
    title: "정식 멤버에게 열립니다",
    description: "Google로 멤버를 시작하면 먼저 보기 멤버가 되고, 호스트 승인 후 정식 멤버가 됩니다.",
  },
  settings: {
    title: "정식 멤버에게 열립니다",
    description: "계정 설정은 정식 멤버가 된 뒤 이어서 관리할 수 있습니다.",
  },
  notifications: {
    title: "정식 멤버에게 열립니다",
    description: "알림과 수신 설정은 정식 멤버가 된 뒤 이어서 관리할 수 있습니다.",
  },
  member: {
    title: "정식 멤버에게 열립니다",
    description: "이 공간은 정식 멤버가 된 뒤 이어서 볼 수 있습니다.",
  },
};

export function GuestLockedPage({
  kind,
  returnTo,
  LinkComponent,
}: {
  kind: GuestLockKind;
  returnTo: string;
  LinkComponent: ComponentType<GuestLinkProps>;
}) {
  const copy = lockCopy[kind];

  return (
    <main className="rm-guest-route container" aria-labelledby="guest-lock-title">
      <section className="surface rm-guest-lock" role="status" aria-live="polite">
        <p className="eyebrow">멤버십 안내</p>
        <h1 id="guest-lock-title" className="h1 editorial">
          {copy.title}
        </h1>
        <p className="body">{copy.description}</p>
        <LinkComponent className="btn btn-primary rm-guest-lock__action" to={loginPathForReturnTo(returnTo)}>
          멤버로 시작
        </LinkComponent>
      </section>
    </main>
  );
}
