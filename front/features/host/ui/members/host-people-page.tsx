import type { ReactNode } from "react";
import "@/features/host/ui/host-editorial-ledger.css";

export type HostPeopleScheduleSeenCounts = {
  current: number;
  stale: number;
  unseen: number;
  notTarget?: number;
};

export function HostPeoplePage({
  children,
  scheduleSeen,
}: {
  children: ReactNode;
  scheduleSeen?: HostPeopleScheduleSeenCounts;
}) {
  return (
    <main className="rm-host-members-page rm-host-editorial-ledger rm-host-editorial-ledger--context">
      <section className="page-header-compact">
        <div className="container rm-host-editorial-ledger__context">
          <div className="eyebrow rm-host-editorial-ledger__eyebrow">운영 · 사람</div>
          <h1 className="h1 editorial rm-host-editorial-ledger__heading">사람</h1>
          <p className="small rm-host-editorial-ledger__lede">
            가입부터 일정 확인, 참석 기록까지 멤버의 흐름을 관리하세요.
          </p>
        </div>
      </section>
      <section className="container rm-host-members-page__body rm-host-editorial-ledger--split">
        <div>{children}</div>
        <aside className="rm-host-editorial-ledger__rail" aria-labelledby="schedule-seen-title">
          <h2 id="schedule-seen-title">현재 일정 확인</h2>
          {scheduleSeen ? (
            <ul className="rm-host-editorial-ledger__list">
              <li className="rm-host-editorial-ledger__row"><span>현재 일정 확인</span><span>{scheduleSeen.current}</span></li>
              <li className="rm-host-editorial-ledger__row"><span>변경 전 확인</span><span>{scheduleSeen.stale}</span></li>
              <li className="rm-host-editorial-ledger__row"><span>미열람</span><span>{scheduleSeen.unseen}</span></li>
              {scheduleSeen.notTarget != null ? (
                <li className="rm-host-editorial-ledger__row"><span>대상 아님</span><span>{scheduleSeen.notTarget}</span></li>
              ) : null}
            </ul>
          ) : (
            <p className="small">최근 접속은 클럽 공간 기준이며, 일정 확인은 사람 상세에서 따로 봅니다.</p>
          )}
          <p className="small">최근 접속은 클럽 공간 기준이며 페이지별 활동은 표시하지 않아요.</p>
        </aside>
      </section>
    </main>
  );
}
