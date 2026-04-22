import { useCallback, useEffect } from "react";
import { useLocation } from "react-router-dom";
import { publicRecordsReturnTarget, readmatesReturnState, restoreReadmatesListScroll } from "@/src/app/route-continuity";
import { Link } from "@/src/app/router-link";
import type { PublicClubResponse, PublicSessionListItem } from "@/shared/api/readmates";
import { readmatesFetch } from "@/shared/api/readmates";
import { BookCover } from "@/shared/ui/book-cover";
import { displayText, formatDateLabel, nonNegativeCount } from "@/shared/ui/readmates-display";
import { PUBLIC_INTRODUCTION_FALLBACK, PUBLIC_TAGLINE_FALLBACK } from "@/features/public/components/public-club-copy";
import { useReadmatesData } from "./readmates-page-data";
import { ReadmatesPageState } from "./readmates-page";

function sessionHref(session: PublicSessionListItem) {
  return `/sessions/${encodeURIComponent(session.sessionId)}`;
}

function sessionDisplay(session: PublicSessionListItem) {
  return {
    title: displayText(session.bookTitle, "도서 제목 미정"),
    author: displayText(session.bookAuthor, "저자 미상"),
    date: formatDateLabel(session.date),
    summary: displayText(session.summary, "공개 요약이 아직 준비되지 않았습니다."),
    highlightCount: nonNegativeCount(session.highlightCount),
    oneLinerCount: nonNegativeCount(session.oneLinerCount),
  };
}

function PublicRecordIndexRow({ session }: { session: PublicSessionListItem }) {
  const display = sessionDisplay(session);

  return (
    <Link
      to={sessionHref(session)}
      state={readmatesReturnState(publicRecordsReturnTarget)}
      className="rm-record-row public-record-index-row"
    >
      <BookCover title={display.title} author={display.author} imageUrl={session.bookImageUrl} width={72} />
      <span className="public-record-index-row__body">
        <span className="mono tiny">No.{session.sessionNumber} · {display.date}</span>
        <span className="editorial public-record-index-row__title">{display.title}</span>
        <span className="small" style={{ color: "var(--text-2)" }}>
          {display.author}
        </span>
        <span className="body public-record-index-row__summary">{display.summary}</span>
      </span>
      <span className="public-archive-row__counts">
        <span>하이라이트 {display.highlightCount}</span>
        <span>한줄평 {display.oneLinerCount}</span>
      </span>
    </Link>
  );
}

function PublicRecordsContent({
  data,
  routePathname,
  routeSearch,
}: {
  data: PublicClubResponse;
  routePathname: string;
  routeSearch: string;
}) {
  useEffect(() => {
    return restoreReadmatesListScroll(routePathname, routeSearch);
  }, [routePathname, routeSearch, data.recentSessions.length]);

  const clubName = displayText(data.clubName, "읽는사이");
  const tagline = displayText(data.tagline, PUBLIC_TAGLINE_FALLBACK);
  const about = displayText(data.about, PUBLIC_INTRODUCTION_FALLBACK);
  const recentCount = data.recentSessions.length;
  const publicSessionCount = nonNegativeCount(data.stats.sessions);
  const showsRecentSubset = publicSessionCount > recentCount;
  const countLabel = showsRecentSubset ? `최근 ${recentCount}개 공개 기록` : `공개 기록 ${recentCount}개`;

  return (
    <main className="page-frame public-record-index">
            <section className="page-header">
              <div className="container container-sm">
                <div className="eyebrow" style={{ marginBottom: 14 }}>
                  {clubName} · {showsRecentSubset ? "최근 공개 기록" : "공개 아카이브"}
                </div>
                <h1 className="h1 editorial" style={{ margin: 0 }}>
                  {showsRecentSubset ? "최근 공개 기록 색인" : "공개 기록 색인"}
                </h1>
                <p className="body-lg" style={{ color: "var(--text-2)", marginTop: 16, maxWidth: 620 }}>
                  {tagline}
                </p>
                <p className="body" style={{ color: "var(--text-2)", marginTop: 12, maxWidth: 620 }}>
                  {about}
                </p>
              </div>
            </section>

            <section className="public-section">
              <div className="container container-sm">
                <div className="row-between public-section-head">
                  <div>
                    <div className="eyebrow" style={{ marginBottom: 8 }}>
                      공개 기록
                    </div>
                    <h2 className="h2 editorial" style={{ margin: 0 }}>
                      {showsRecentSubset ? "최근 발행된 순서대로" : "발행된 순서대로"}
                    </h2>
                  </div>
                  <div className="small">
                    {countLabel}
                    {showsRecentSubset ? (
                      <span style={{ display: "block", marginTop: 4, color: "var(--text-3)" }}>
                        전체 공개 모임 {publicSessionCount}회 중 공개된 최근 기록
                      </span>
                    ) : null}
                  </div>
                </div>

                {recentCount > 0 ? (
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
                      공개 색인은 빈 상태도 보관합니다. 모임 이후 발행된 요약과 한줄평이 생기면 이 목록에서 먼저 볼 수 있습니다.
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

export default function PublicRecordsPage() {
  const location = useLocation();
  const state = useReadmatesData(useCallback(() => readmatesFetch<PublicClubResponse>("/api/public/club"), []));

  return (
    <ReadmatesPageState state={state} loadingLabel="공개 기록을 불러오는 중" loadingVariant="public">
      {(data) => <PublicRecordsContent data={data} routePathname={location.pathname} routeSearch={location.search} />}
    </ReadmatesPageState>
  );
}
