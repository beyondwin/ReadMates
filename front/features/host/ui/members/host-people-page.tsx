import { type ReactNode, useId, useState } from "react";
import { ReadmatesIcon, type ReadmatesIconName } from "@/shared/ui/icon";
import "@/features/host/ui/host-editorial-ledger.css";
import { HostPeopleNameQueryContext } from "./host-people-name-query";
import "./member-ledger.css";

export type HostPeopleScheduleSeenCounts = {
  current: number;
  stale: number;
  unseen: number;
  notTarget?: number;
};

export type HostPeopleRosterCounts = {
  all: number;
  active: number;
  viewer: number;
  suspended: number;
};

const STATUS_CHIPS = [
  { id: "all", label: "전체", countKey: "all" },
  { id: "active", label: "활동", countKey: "active" },
  { id: "viewer", label: "둘러보기", countKey: "viewer" },
  { id: "suspended", label: "쉬는 중", countKey: "suspended" },
] as const;

const SCHEDULE_RAIL_ROWS: ReadonlyArray<{
  key: keyof HostPeopleScheduleSeenCounts;
  label: string;
  icon: ReadmatesIconName;
}> = [
  { key: "current", label: "현재 일정 확인", icon: "calendar" },
  { key: "stale", label: "변경 전 확인", icon: "calendar" },
  { key: "unseen", label: "미열람", icon: "mail" },
  { key: "notTarget", label: "대상 아님", icon: "minus-circle" },
];

export type HostPeopleStatusFilter = (typeof STATUS_CHIPS)[number]["id"];

export function HostPeoplePage({
  children,
  scheduleSeen,
  rosterCounts,
  unreadHref,
  pendingZone,
  statusFilter,
  onStatusFilterChange,
}: {
  children: ReactNode;
  scheduleSeen?: HostPeopleScheduleSeenCounts | null;
  rosterCounts?: HostPeopleRosterCounts;
  unreadHref?: string;
  pendingZone?: ReactNode;
  statusFilter?: HostPeopleStatusFilter;
  onStatusFilterChange?: (id: HostPeopleStatusFilter) => void;
}) {
  const searchId = useId();
  const [query, setQuery] = useState("");
  const [uncontrolledFilter, setUncontrolledFilter] = useState<HostPeopleStatusFilter>("all");
  const selectedFilter = statusFilter ?? uncontrolledFilter;
  const setSelectedFilter = onStatusFilterChange ?? setUncontrolledFilter;

  return (
    <HostPeopleNameQueryContext.Provider value={query}>
      <main className="rm-host-members-page rm-host-people rm-host-editorial-ledger rm-host-editorial-ledger--context">
        <section className="page-header-compact">
          <div className="container rm-host-people__header">
            <div className="rm-host-editorial-ledger__context">
              <h1 className="h1 editorial rm-host-editorial-ledger__heading">사람</h1>
              <p className="small rm-host-editorial-ledger__lede">
                가입부터 일정 확인, 참석 기록까지 멤버의 흐름을 관리하세요.
              </p>
            </div>
            <div className="rm-host-people__tools">
              <label className="rm-host-people__search" htmlFor={searchId}>
                <ReadmatesIcon name="search" size={16} />
                <span className="rm-sr-only">검색</span>
                <input
                  id={searchId}
                  type="search"
                  value={query}
                  placeholder="이름으로 찾기"
                  aria-label="이름으로 찾기"
                  onChange={(event) => setQuery(event.currentTarget.value)}
                />
              </label>
              <div className="rm-host-people__filters rm-member-ledger__segments" role="tablist" aria-label="멤버 상태">
                {STATUS_CHIPS.map((chip) => {
                  const selected = selectedFilter === chip.id;
                  const count = rosterCounts?.[chip.countKey];
                  const name = count != null ? `${chip.label} ${count}` : `${chip.label} 상태`;
                  return (
                    <button
                      key={chip.id}
                      type="button"
                      role="tab"
                      aria-label={name}
                      aria-selected={selected}
                      className={`rm-host-people__filter${selected ? " is-selected" : ""}`}
                      onClick={() => setSelectedFilter(chip.id)}
                    >
                      {chip.label}
                      {count != null ? ` ${count}` : ""}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </section>
        <section className="container rm-host-members-page__body">
          {pendingZone}
          <div className="rm-host-editorial-ledger--split">
            <div>{children}</div>
            <aside className="rm-host-editorial-ledger__rail" aria-labelledby="schedule-seen-title">
              <h2 id="schedule-seen-title">현재 일정 확인</h2>
              <ul className="rm-member-ledger__rail">
                {SCHEDULE_RAIL_ROWS.map((row) => {
                  const value = scheduleSeen?.[row.key];
                  return (
                    <li key={row.key} className="rm-member-ledger__rail-row">
                      <ReadmatesIcon name={row.icon} size={24} />
                      <span>{row.label}</span>
                      <span>{value == null ? "—" : value}</span>
                    </li>
                  );
                })}
              </ul>
              {unreadHref ? (
                <a className="rm-host-people__unread" href={unreadHref}>미열람 멤버 보기 ›</a>
              ) : null}
              <p className="small rm-member-ledger__rail-info">
                <ReadmatesIcon name="info" size={16} />
                최근 접속은 클럽 공간 기준이며 세부 활동은 표시하지 않아요.
              </p>
            </aside>
          </div>
        </section>
      </main>
    </HostPeopleNameQueryContext.Provider>
  );
}
