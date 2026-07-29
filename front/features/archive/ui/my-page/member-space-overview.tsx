import type { ReactNode } from "react";

export function MemberSpaceOverview({
  children,
}: { children: ReactNode }) {
  return (
    <section
      className="rm-member-space__overview"
      aria-label="나의 독서 개요"
    >
      {children}
    </section>
  );
}
