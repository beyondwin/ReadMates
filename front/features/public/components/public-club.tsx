import { Link } from "@/src/app/router-link";
import type { PublicClubResponse, PublicSessionListItem } from "@/shared/api/readmates";
import { AvatarChip } from "@/shared/ui/avatar-chip";
import { PublicGuestOnlyLink } from "@/shared/ui/public-auth-action";
import { displayText, formatDateLabel, nonNegativeCount } from "@/shared/ui/readmates-display";
import {
  PUBLIC_INTRODUCTION_FALLBACK,
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
  };
}

function PublicRecordLink({ session }: { session: PublicSessionListItem }) {
  const display = sessionDisplay(session);

  return (
    <Link to={sessionHref(session)} className="public-record-link">
      <span className="mono" style={{ fontSize: "13px", color: "var(--text-3)", letterSpacing: "0.05em" }}>
        No.{session.sessionNumber}
      </span>
      <span>
        <span className="editorial" style={{ display: "block", fontSize: "19px" }}>
          {display.title}
        </span>
        <span className="small" style={{ display: "block", marginTop: "4px" }}>
          {display.author} · {display.date}
        </span>
      </span>
      <span className="row" style={{ gap: "16px", color: "var(--text-3)", justifySelf: "end" }}>
        <span className="badge">공개</span>
        <span aria-hidden>→</span>
      </span>
    </Link>
  );
}

export default function PublicClub({ data }: PublicClubProps) {
  const latestSession = data.recentSessions[0] ?? null;
  const latestHref = latestSession ? sessionHref(latestSession) : "/about";
  const latestLabel = latestSession ? "공개 기록 보기" : "소개로 돌아가기";
  const clubName = displayText(data.clubName, "읽는사이");
  const tagline = displayText(data.tagline, PUBLIC_TAGLINE_FALLBACK);
  const about = displayText(data.about, PUBLIC_INTRODUCTION_FALLBACK);
  const memberCount = nonNegativeCount(data.stats.members);
  const overviewItems = [
    ["시작", STATIC_OPERATION_INTRO.startedAt],
    ["운영 리듬", STATIC_OPERATION_INTRO.cadence],
    ["멤버", `${memberCount}명`],
    ["호스트", `${STATIC_OPERATION_INTRO.hostName} · ${STATIC_OPERATION_INTRO.hostSince}~`],
    ["기록 방식", STATIC_OPERATION_INTRO.recording],
  ];

  return (
    <main className="page-frame">
      <section className="page-header">
        <div className="container public-grid-2" style={{ alignItems: "flex-end" }}>
          <div>
            <div className="eyebrow" style={{ marginBottom: "16px" }}>
              {clubName} · {tagline}
            </div>
            <h1 className="h1 editorial" style={{ margin: 0 }}>
              {clubName}
            </h1>
            <p className="body-lg" style={{ color: "var(--text-2)", marginTop: "16px", maxWidth: "520px" }}>
              {about}
            </p>
          </div>

          <div className="surface-quiet" style={{ padding: "24px" }} aria-label="클럽 운영 정보">
            <dl
              style={{
                display: "grid",
                gridTemplateColumns: "auto 1fr",
                columnGap: "16px",
                rowGap: "8px",
                margin: 0,
              }}
            >
              {overviewItems.map(([label, value]) => (
                <div key={label} style={{ display: "contents" }}>
                  <dt className="eyebrow">{label}</dt>
                  <dd style={{ margin: 0 }}>{value}</dd>
                </div>
              ))}
            </dl>
            <hr className="divider-soft" style={{ margin: "18px 0" }} />
            <div className="row" style={{ gap: "8px", flexWrap: "wrap" }}>
              <PublicGuestOnlyLink
                action={{ href: "/login", label: "초대 수락 / 로그인" }}
                className="btn btn-primary btn-sm"
              />
              <Link to={latestHref} className="btn btn-ghost btn-sm">
                {latestLabel}
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section style={{ padding: "56px 0" }}>
        <div className="container public-grid-2">
          <div>
            <div className="eyebrow" style={{ marginBottom: "10px" }}>
              호스트 안내
            </div>
            <h2 className="h2 editorial" style={{ margin: "0 0 16px" }}>
              호스트의 글
            </h2>
            <div className="surface" style={{ padding: "28px" }}>
              <div className="row" style={{ gap: "12px" }}>
                <AvatarChip
                  name={STATIC_OPERATION_INTRO.hostName}
                  label={STATIC_OPERATION_INTRO.hostName}
                  size={32}
                />
                <div>
                  <div className="h4 editorial">{STATIC_OPERATION_INTRO.hostName}</div>
                  <div className="tiny">호스트 · {STATIC_OPERATION_INTRO.hostSince}~</div>
                </div>
              </div>
              <p className="body" style={{ color: "var(--text-2)", marginTop: "16px" }}>
                {STATIC_OPERATION_INTRO.hostNote}
              </p>
              <div className="rule" style={{ marginTop: "20px" }}>
                <span>운영 안내</span>
              </div>
            </div>
          </div>

          <div>
            <div className="eyebrow" style={{ marginBottom: "10px" }}>
              운영 원칙
            </div>
            <h2 className="h2 editorial" style={{ margin: "0 0 16px" }}>
              우리가 소중히 여기는 것
            </h2>
            <div className="public-record-list">
              {[
                "서로의 문장과 해석을 존중합니다.",
                "누가 옳은지보다 어떤 생각이 떠올랐는지에 집중합니다.",
                "말하기만큼 잘 듣는 것을 중요하게 생각합니다.",
              ].map((principle, index) => (
                <div
                  key={principle}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "40px 1fr",
                    padding: "18px 0",
                    borderTop: "1px solid var(--line-soft)",
                  }}
                >
                  <span className="mono tiny">{String(index + 1).padStart(2, "0")}</span>
                  <span className="body editorial" style={{ fontSize: "17px" }}>
                    {principle}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section id="public-records" style={{ padding: "40px 0 100px" }}>
        <div className="container">
          <div className="row-between" style={{ alignItems: "flex-end", marginBottom: "20px" }}>
            <div>
              <div className="eyebrow" style={{ marginBottom: "8px" }}>
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
            <div className="surface" style={{ padding: "28px" }}>
              공개된 모임 기록이 없습니다.
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
