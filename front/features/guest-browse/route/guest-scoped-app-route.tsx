import type { ComponentType, ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { guestNavigationCapability } from "@/features/guest-browse/model/club-app-audience";
import { GuestLockedPage, type GuestLockKind } from "@/features/guest-browse/ui/guest-locked-page";
import { GuestMySpace } from "@/features/guest-browse/ui/guest-my-space";

type GuestLinkProps = {
  to: string;
  className?: string;
  children: ReactNode;
};

function requestedAppPath(pathname: string) {
  return pathname.replace(/^\/clubs\/[^/]+(?=\/app(?:\/|$))/, "");
}

function lockKind(path: string): GuestLockKind {
  if (path.startsWith("/app/feedback/")) return "feedback";
  if (path.startsWith("/app/notifications")) return "notifications";
  if (path === "/app/me/settings") return "settings";
  return "member";
}

export function GuestScopedAppRoute({ LinkComponent }: { LinkComponent: ComponentType<GuestLinkProps> }) {
  const location = useLocation();
  const appPath = requestedAppPath(location.pathname);
  const capability = guestNavigationCapability(appPath);

  if (capability === "PREVIEW") {
    return <GuestMySpace returnTo={location.pathname} LinkComponent={LinkComponent} />;
  }

  if (capability === "LOCKED") {
    return (
      <GuestLockedPage
        kind={lockKind(appPath)}
        returnTo={location.pathname}
        LinkComponent={LinkComponent}
      />
    );
  }

  return (
    <main className="rm-guest-route container" aria-labelledby="guest-browse-title">
      <section className="surface rm-guest-browse-landing">
        <p className="eyebrow">게스트</p>
        <h1 id="guest-browse-title" className="h1 editorial">
          클럽 둘러보기
        </h1>
        <p className="body">공개된 클럽 기록을 차분히 둘러볼 수 있습니다.</p>
      </section>
    </main>
  );
}
