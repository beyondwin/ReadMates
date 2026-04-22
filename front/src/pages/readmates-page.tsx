import type { CSSProperties } from "react";
import { useInRouterContext, useLocation } from "react-router-dom";

export type ReadmatesLoadingVariant = "public" | "member" | "host" | "auth";

function loadingVariantFromPathname(pathname: string): ReadmatesLoadingVariant {
  if (pathname.startsWith("/app/host")) {
    return "host";
  }

  if (pathname.startsWith("/app")) {
    return "member";
  }

  return pathname === "/login" || pathname.startsWith("/invite/") || pathname.startsWith("/reset-password/")
    ? "auth"
    : "public";
}

function SkeletonLine({ width = "100%", height = 14 }: { width?: string; height?: number }) {
  return <span className="rm-skeleton-line" style={{ "--w": width, "--h": `${height}px` } as CSSProperties} />;
}

function PublicLoadingSkeleton() {
  return (
    <div className="rm-loading-public-records" aria-hidden="true">
      {[0, 1, 2].map((index) => (
        <div className="rm-loading-public-record" key={index}>
          <SkeletonLine width="42px" height={18} />
          <div className="stack" style={{ "--stack": "8px" } as CSSProperties}>
            <SkeletonLine width={index === 0 ? "82%" : "68%"} height={18} />
            <SkeletonLine width="54%" height={12} />
          </div>
          <SkeletonLine width="52px" height={12} />
        </div>
      ))}
    </div>
  );
}

function MemberLoadingSkeleton() {
  return (
    <div className="rm-loading-member-desk" aria-hidden="true">
      <div className="rm-loading-member-panel stack" style={{ "--stack": "14px" } as CSSProperties}>
        <SkeletonLine width="34%" height={12} />
        <SkeletonLine width="76%" height={26} />
        <SkeletonLine width="58%" height={14} />
        <span className="rm-skeleton-block" style={{ "--h": "150px" } as CSSProperties} />
      </div>
      <div className="rm-loading-member-panel stack" style={{ "--stack": "12px" } as CSSProperties}>
        <SkeletonLine width="46%" height={12} />
        <SkeletonLine width="88%" height={18} />
        <SkeletonLine width="74%" height={18} />
        <SkeletonLine width="66%" height={18} />
        <SkeletonLine width="48%" height={18} />
      </div>
    </div>
  );
}

function HostLoadingSkeleton() {
  return (
    <div className="rm-loading-host-panel" aria-hidden="true">
      <div className="rm-loading-host-ledger">
        {[0, 1, 2, 3, 4].map((index) => (
          <div className="rm-loading-host-row" key={index}>
            <SkeletonLine width={index % 2 === 0 ? "82%" : "70%"} height={14} />
            <SkeletonLine width="72%" height={14} />
            <SkeletonLine width="54%" height={14} />
            <SkeletonLine width="56px" height={24} />
          </div>
        ))}
      </div>
    </div>
  );
}

function LoadingSkeleton({ variant }: { variant: ReadmatesLoadingVariant }) {
  if (variant === "host") {
    return <HostLoadingSkeleton />;
  }

  if (variant === "member") {
    return <MemberLoadingSkeleton />;
  }

  return <PublicLoadingSkeleton />;
}

function ReadmatesRouteLoadingFrame({
  label = "화면을 불러오는 중",
  variant,
}: {
  label?: string;
  variant: ReadmatesLoadingVariant;
}) {
  const headerLabel =
    variant === "host" ? "운영 장부를 준비하고 있습니다" : variant === "member" ? "읽기 공간을 준비하고 있습니다" : "기록을 준비하고 있습니다";

  return (
    <main className={`rm-route-loading rm-route-loading--${variant}`}>
      <div className="container rm-route-loading__inner">
        <div className="rm-route-loading__header" aria-hidden="true">
          <SkeletonLine width="118px" height={11} />
          <SkeletonLine width={variant === "host" ? "420px" : "360px"} height={30} />
          <SkeletonLine width="260px" height={14} />
        </div>
        <div role="status" aria-live="polite" className="rm-sr-only">
          {label}
        </div>
        <span className="rm-sr-only">{headerLabel}</span>
        <LoadingSkeleton variant={variant} />
      </div>
    </main>
  );
}

function ReadmatesRouteLoadingInRouter({ label, variant }: { label?: string; variant?: ReadmatesLoadingVariant }) {
  const location = useLocation();
  return <ReadmatesRouteLoadingFrame label={label} variant={variant ?? loadingVariantFromPathname(location.pathname)} />;
}

export function ReadmatesRouteLoading({
  label = "화면을 불러오는 중",
  variant,
}: {
  label?: string;
  variant?: ReadmatesLoadingVariant;
}) {
  const inRouter = useInRouterContext();

  if (inRouter) {
    return <ReadmatesRouteLoadingInRouter label={label} variant={variant} />;
  }

  return <ReadmatesRouteLoadingFrame label={label} variant={variant ?? "member"} />;
}
