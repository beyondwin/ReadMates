import { useEffect } from "react";
import { Link } from "@/features/public/ui/public-link";
import { readmatesReturnState, publicRecordsReturnTarget, restoreReadmatesPublicRecordsScroll } from "@/features/public/ui/public-route-continuity";
import type { PublicClubView, PublicSessionListItemView } from "@/features/public/model/public-display-model";
import { getPublicRecordsDisplay, getPublicSessionListItemDisplay } from "@/features/public/model/public-display-model";
import { BookCover } from "@/shared/ui/book-cover";

function sessionHref(session: PublicSessionListItemView) {
  return `/sessions/${encodeURIComponent(session.sessionId)}`;
}

function PublicRecordIndexRow({ session }: { session: PublicSessionListItemView }) {
  const display = getPublicSessionListItemDisplay(session);

  return (
    <Link
      to={sessionHref(session)}
      state={readmatesReturnState(publicRecordsReturnTarget)}
      className="rm-record-row public-record-index-row"
    >
      <BookCover title={display.title} author={display.author} imageUrl={session.bookImageUrl} width={72} />
      <span className="public-record-index-row__body">
        <span className="mono tiny public-record-index-row__meta" aria-label={`No.${session.sessionNumber} · ${display.date}`}>
          <span>No.{session.sessionNumber}</span>
          <span aria-hidden="true">·</span>
          <span>{display.date}</span>
        </span>
        <span className="public-archive-row__counts public-record-index-row__counts">
          <span>하이라이트 {display.highlightCount}</span>
          <span aria-hidden="true">·</span>
          <span>한줄평 {display.oneLinerCount}</span>
        </span>
        <span className="editorial public-record-index-row__title">{display.title}</span>
        <span className="small public-record-index-row__author" style={{ color: "var(--text-2)" }}>
          {display.author}
        </span>
        <span className="body public-record-index-row__summary">{display.summary}</span>
      </span>
    </Link>
  );
}

export default function PublicRecordsPage({
  data,
  routePathname,
  routeSearch,
}: {
  data: PublicClubView;
  routePathname: string;
  routeSearch: string;
}) {
  useEffect(() => {
    return restoreReadmatesPublicRecordsScroll(routePathname, routeSearch);
  }, [routePathname, routeSearch, data.recentSessions.length]);

  const display = getPublicRecordsDisplay(data);
  const headerDescription = display.showsRecentSubset
    ? "최근 발행한 책과 대화의 흔적을 모았습니다."
    : "함께 읽은 책과 대화에서 남은 문장을 모았습니다.";

  return (
    <main className="page-frame public-record-index">
      <section className="page-header">
        <div className="container container-sm">
          <div className="eyebrow" style={{ marginBottom: 14 }}>
            기록 모음
          </div>
          <h1 className="h1 editorial" style={{ margin: 0 }}>
            공개 기록
          </h1>
          <p className="body-lg" style={{ color: "var(--text-2)", marginTop: 16, maxWidth: 620 }}>
            {headerDescription}
          </p>
          <p className="body" style={{ color: "var(--text-2)", marginTop: 12, maxWidth: 620 }}>
            공개 기록은 누구나 읽을 수 있고, 모임 참여는 초대받은 멤버에게만 열려 있습니다.
          </p>
        </div>
      </section>

      <section className="public-section">
        <div className="container container-sm">
          <div className="row-between public-section-head">
            <div className="small" style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <h2 className="small" style={{ margin: 0 }}>
                발행된 기록
              </h2>
              <span aria-hidden="true">·</span>
              <span>{display.countLabel}</span>
            </div>
          </div>

          {display.recentCount > 0 ? (
            <div className="public-record-list">
              {data.recentSessions.map((session) => (
                <PublicRecordIndexRow key={session.sessionId} session={session} />
              ))}
            </div>
          ) : (
            <div className="rm-empty-state public-empty-record">
              <div className="eyebrow">공개 기록</div>
              <div className="h3 editorial" style={{ marginTop: 10 }}>
                아직 발행된 공개 기록이 없습니다
              </div>
              <p className="body" style={{ margin: "12px 0 0" }}>
                아직 공개된 기록이 없어도 이 자리는 열어둡니다. 모임 이후 발행된 요약과 한줄평이 생기면 이 목록에서 먼저 볼 수 있습니다.
              </p>
              <Link to="/about" className="btn btn-ghost btn-sm" style={{ marginTop: 18 }}>
                클럽 소개 보기
              </Link>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
