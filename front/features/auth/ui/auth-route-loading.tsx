import type { CSSProperties } from "react";

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

export function AuthRouteLoading({ label = "화면을 불러오는 중" }: { label?: string }) {
  return (
    <main className="rm-route-loading rm-route-loading--auth">
      <div className="container rm-route-loading__inner">
        <div className="rm-route-loading__header" aria-hidden="true">
          <SkeletonLine width="118px" height={11} />
          <SkeletonLine width="360px" height={30} />
          <SkeletonLine width="260px" height={14} />
        </div>
        <div role="status" aria-live="polite" className="rm-sr-only">
          {label}
        </div>
        <span className="rm-sr-only">기록을 준비하고 있습니다</span>
        <PublicLoadingSkeleton />
      </div>
    </main>
  );
}
