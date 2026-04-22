import { Link } from "@/src/app/router-link";
import type { PublicClubResponse, PublicSessionListItem } from "@/shared/api/readmates";
import { AvatarChip } from "@/shared/ui/avatar-chip";
import { BookCover } from "@/shared/ui/book-cover";
import { PublicGuestOnlyActions, PublicInviteGuidance } from "@/shared/ui/public-auth-action";
import { displayText, formatDateLabel, nonNegativeCount } from "@/shared/ui/readmates-display";
import {
  PUBLIC_INTRODUCTION_FALLBACK,
  PUBLIC_MEMBERSHIP_NOTE,
  PUBLIC_TAGLINE_FALLBACK,
  STATIC_OPERATION_INTRO,
} from "./public-club-copy";

type PublicClubProps = {
  data: PublicClubResponse;
};

function sessionHref(session: PublicSessionListItem) {
  return `/sessions/${session.sessionId}`;
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

function PublicRecordLink({ session }: { session: PublicSessionListItem }) {
  const display = sessionDisplay(session);

  return (
    <Link to={sessionHref(session)} className="rm-record-row public-archive-row">
      <span className="mono tiny public-archive-row__number">No.{session.sessionNumber}</span>
      <span className="public-archive-row__main">
        <span className="editorial public-archive-row__title">{display.title}</span>
        <span className="small public-archive-row__meta">
          {display.author} · {display.date}
        </span>
      </span>
      <span className="public-archive-row__counts">
        <span>하이라이트 {display.highlightCount}</span>
        <span>한줄평 {display.oneLinerCount}</span>
      </span>
    </Link>
  );
}

function LatestRecordPanel({ session }: { session: PublicSessionListItem | null }) {
  if (!session) {
    return (
      <div className="rm-empty-state public-empty-record">
        <div className="eyebrow">공개 기록</div>
        <div className="h3 editorial" style={{ marginTop: 10 }}>
          아직 발행된 공개 기록이 없습니다
        </div>
        <p className="body" style={{ margin: "12px 0 0" }}>
          공개 가능한 모임 기록이 정리되면 이곳에서 먼저 확인할 수 있습니다.
        </p>
      </div>
    );
  }

  const display = sessionDisplay(session);

  return (
    <Link to={sessionHref(session)} className="rm-document-panel public-club-latest">
      <BookCover title={display.title} author={display.author} imageUrl={session.bookImageUrl} width={88} />
      <div>
        <div className="eyebrow">최근 공개 기록 · No.{session.sessionNumber}</div>
        <div className="h3 editorial" style={{ marginTop: 8 }}>
          {display.title}
        </div>
        <p className="small" style={{ margin: "6px 0 0", color: "var(--text-2)" }}>
          {display.author} · {display.date}
        </p>
        <p className="body" style={{ margin: "14px 0 0", color: "var(--text-2)" }}>
          {display.summary}
        </p>
      </div>
    </Link>
  );
}

export default function PublicClub({ data }: PublicClubProps) {
  const latestSession = data.recentSessions[0] ?? null;
  const clubName = displayText(data.clubName, "읽는사이");
  const tagline = displayText(data.tagline, PUBLIC_TAGLINE_FALLBACK);
  const about = displayText(data.about, PUBLIC_INTRODUCTION_FALLBACK);
  const memberCount = nonNegativeCount(data.stats.members);
  const overviewItems = [
    ["시작", STATIC_OPERATION_INTRO.startedAt],
    ["운영 리듬", STATIC_OPERATION_INTRO.cadence],
    ["멤버 정원", `${memberCount}명 소규모 초대제`],
    ["호스트", `${STATIC_OPERATION_INTRO.hostName} · ${STATIC_OPERATION_INTRO.hostSince}~`],
    ["기록 방식", STATIC_OPERATION_INTRO.recording],
  ];
  const rules = [
    ["준비", "모임 전 질문 2~3개를 준비하고 우선순위를 남깁니다."],
    ["대화", "정답을 맞히기보다 서로의 해석이 어디서 갈라지는지 듣습니다."],
    ["기록", "공개 가능한 요약, 하이라이트, 한줄평만 외부 기록으로 발행합니다."],
    ["경계", "참여, 피드백 문서, 개인 노트는 정식 멤버 공간에만 남깁니다."],
  ];

  return (
    <main className="page-frame public-club">
      <section className="page-header public-club-header">
        <div className="container public-grid-2" style={{ alignItems: "end" }}>
          <div>
            <div className="eyebrow" style={{ marginBottom: 16 }}>
              {clubName} · {tagline}
            </div>
            <h1 className="h1 editorial" style={{ margin: 0 }}>
              {clubName}
            </h1>
            <p className="body-lg" style={{ color: "var(--text-2)", marginTop: 16, maxWidth: 560 }}>
              {about}
            </p>
          </div>

          <aside className="rm-document-panel public-club-overview" aria-label="클럽 운영 정보">
            <dl>
              {overviewItems.map(([label, value]) => (
                <div key={label}>
                  <dt className="eyebrow">{label}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>
          </aside>
        </div>
      </section>

      <section className="public-section">
        <div className="container public-grid-2">
          <div>
            <div className="eyebrow" style={{ marginBottom: 8 }}>
              규칙과 cadence
            </div>
            <h2 className="h2 editorial" style={{ margin: 0 }}>
              작게 읽고, 분명하게 남깁니다
            </h2>
          </div>
          <div className="public-ledger-list">
            {rules.map(([label, body], index) => (
              <div className="rm-ledger-row public-ledger-row" key={label}>
                <span className="mono tiny">{String(index + 1).padStart(2, "0")}</span>
                <span className="eyebrow">{label}</span>
                <span className="body editorial">{body}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="public-section public-section--subtle">
        <div className="container public-grid-2">
          <div>
            <div className="eyebrow" style={{ marginBottom: 8 }}>
              호스트 안내
            </div>
            <h2 className="h2 editorial" style={{ margin: 0 }}>
              호스트의 글
            </h2>
          </div>
          <div className="rm-document-panel public-host-note">
            <div className="row" style={{ gap: 12 }}>
              <AvatarChip name={STATIC_OPERATION_INTRO.hostName} label={STATIC_OPERATION_INTRO.hostName} size={32} />
              <div>
                <div className="h4 editorial">{STATIC_OPERATION_INTRO.hostName}</div>
                <div className="tiny">호스트 · {STATIC_OPERATION_INTRO.hostSince}~</div>
              </div>
            </div>
            <p className="body" style={{ color: "var(--text-2)", marginTop: 16 }}>
              {STATIC_OPERATION_INTRO.hostNote}
            </p>
          </div>
        </div>
      </section>

      <section className="public-section">
        <div className="container public-grid-2">
          <div>
            <div className="eyebrow" style={{ marginBottom: 8 }}>
              멤버십
            </div>
            <h2 className="h2 editorial" style={{ margin: 0 }}>
              초대받은 사람만 참여할 수 있습니다
            </h2>
            <p className="body" style={{ marginTop: 14, color: "var(--text-2)" }}>
              {PUBLIC_MEMBERSHIP_NOTE}
            </p>
            <div className="public-actions">
              <PublicGuestOnlyActions>
                <Link to="/login" className="btn btn-primary">
                  기존 멤버 로그인
                </Link>
                <PublicInviteGuidance />
              </PublicGuestOnlyActions>
            </div>
            <p className="tiny" style={{ margin: "14px 0 0", color: "var(--text-3)" }}>
              초대받은 독자는 호스트가 보낸 초대 링크에서 수락 절차를 시작합니다.
            </p>
          </div>
          <LatestRecordPanel session={latestSession} />
        </div>
      </section>

      <section id="public-records" className="public-section">
        <div className="container">
          <div className="row-between public-section-head">
            <div>
              <div className="eyebrow" style={{ marginBottom: 8 }}>
                공개 기록
              </div>
              <h2 className="h2 editorial" style={{ margin: 0 }}>
                공개된 모임 기록
              </h2>
            </div>
            <div className="small">총 {data.recentSessions.length}개의 공개 기록</div>
          </div>

          {data.recentSessions.length > 0 ? (
            <div className="public-record-list">
              {data.recentSessions.map((session) => (
                <PublicRecordLink key={session.sessionId} session={session} />
              ))}
            </div>
          ) : (
            <div className="rm-empty-state public-empty-record">
              <div className="eyebrow">공개 기록</div>
              <div className="h3 editorial" style={{ marginTop: 10 }}>
                아직 발행된 공개 기록이 없습니다
              </div>
              <p className="body" style={{ margin: "12px 0 0" }}>
                기록이 없다는 상태도 의도적으로 보관합니다. 발행된 모임이 생기면 이 색인에 추가됩니다.
              </p>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
