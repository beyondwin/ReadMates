import { type CSSProperties, useState } from "react";
import { LogoutButton } from "@/features/auth/components/logout-button";
import type { FeedbackDocumentListItem, MyPageResponse } from "@/shared/api/readmates";
import { readmatesFetchResponse } from "@/shared/api/readmates";
import { AvatarChip } from "@/shared/ui/avatar-chip";
import { formatDateOnlyLabel } from "@/shared/ui/readmates-display";
import { appFeedbackHref, readmatesReturnState } from "@/src/app/route-continuity";
import { Link } from "@/src/app/router-link";

const notifications = [
  { label: "다음 모임 7일 전 리마인더", sub: "책·일정·미팅 URL" },
  { label: "질문 마감 전날 알림", sub: "모임 전날 21시" },
  { label: "피드백 문서 등록 알림", sub: "내 문서가 올라오면" },
  { label: "다른 멤버의 서평 공개", sub: "같은 책에 한해" },
];

type MyPageProps = {
  data: MyPageResponse;
  reports: FeedbackDocumentListItem[];
  reviewCount: number;
  questionCount: number;
};

function membershipIdentityLabel(data: MyPageResponse) {
  if (data.role === "HOST" && data.membershipStatus === "ACTIVE") {
    return "호스트";
  }

  switch (data.membershipStatus) {
    case "ACTIVE":
      return "정식 멤버";
    case "VIEWER":
      return "둘러보기 멤버";
    case "SUSPENDED":
      return "일시 정지 멤버";
    case "INVITED":
      return "초대 대기";
    case "LEFT":
      return "탈퇴한 멤버";
    case "INACTIVE":
      return "비활성 멤버";
  }
}

function clubDisplayName(data: MyPageResponse) {
  return data.clubName?.trim() || "클럽 정보 없음";
}

function membershipJoinedLine(data: MyPageResponse) {
  const joinedMonth = formatJoinedMonth(data.joinedAt);
  return joinedMonth === "합류 전" ? `${membershipIdentityLabel(data)} · 합류 전` : `${membershipIdentityLabel(data)} · ${joinedMonth} 합류`;
}

export default function MyPage({ data, reports, reviewCount, questionCount }: MyPageProps) {
  return (
    <main className="rm-my-page">
      <div className="desktop-only">
        <MyDesktop data={data} reports={reports} reviewCount={reviewCount} questionCount={questionCount} />
      </div>
      <div className="mobile-only">
        <MyMobile data={data} reports={reports} reviewCount={reviewCount} questionCount={questionCount} />
      </div>
    </main>
  );
}

function MyDesktop({
  data,
  reports,
  reviewCount,
  questionCount,
}: {
  data: MyPageResponse;
  reports: FeedbackDocumentListItem[];
  reviewCount: number;
  questionCount: number;
}) {
  return (
    <>
      <section className="page-header-compact">
        <div className="container">
          <p className="eyebrow" style={{ margin: 0 }}>
            내 공간
          </p>
          <h1 className="h1 editorial" style={{ margin: "6px 0 4px" }}>
            내 공간
          </h1>
          <p className="small" style={{ color: "var(--text-2)", margin: 0 }}>
            멤버 정체성, 참석, 내가 쓴 기록, 계정 경계를 확인합니다.
          </p>
        </div>
      </section>

      <section style={{ padding: "40px 0 80px" }}>
        <div className="container" style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.1fr) minmax(320px, 1fr)", gap: "56px" }}>
          <div className="stack" style={{ "--stack": "44px" } as CSSProperties}>
            <AccountSection data={data} />
            <RhythmSection data={data} reviewCount={reviewCount} questionCount={questionCount} />
            <WritingSection reviewCount={reviewCount} questionCount={questionCount} />
            <FeedbackReports reports={reports} />
          </div>

          <div className="stack" style={{ "--stack": "36px" } as CSSProperties}>
            <NotificationsSection />
            <PreferencesSection data={data} />
            <DangerZone />
          </div>
        </div>
      </section>
    </>
  );
}

function MyMobile({
  data,
  reports,
  reviewCount,
  questionCount,
}: {
  data: MyPageResponse;
  reports: FeedbackDocumentListItem[];
  reviewCount: number;
  questionCount: number;
}) {
  return (
    <div className="rm-my-mobile m-body">
      <section style={{ padding: "18px 18px 8px" }}>
        <div className="m-card">
          <div className="m-row" style={{ gap: 14 }}>
            <AvatarChip name={data.displayName} fallbackInitial={data.shortName} label={data.displayName} size={56} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="h3 editorial">{data.displayName}</div>
              <div className="small">{data.email}</div>
            </div>
            <span className="tiny" aria-label="프로필 수정 준비 중" style={{ color: "var(--text-3)", flexShrink: 0 }}>
              준비 중
            </span>
          </div>
          <hr className="divider-soft" style={{ margin: "18px 0 14px" }} />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, textAlign: "center" }}>
            {[
              { label: "참석", value: String(data.sessionCount) },
              { label: "서평", value: String(reviewCount) },
              { label: "질문", value: String(questionCount) },
            ].map((item) => (
              <div key={item.label}>
                <div className="editorial" style={{ fontSize: 22, letterSpacing: "-0.02em" }}>
                  {item.value}
                </div>
                <div className="tiny mono" style={{ color: "var(--text-3)", marginTop: 2 }}>
                  {item.label}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <MobileFeedbackReports reports={reports} />

      <section className="m-sec">
        <MobileWritingSection reviewCount={reviewCount} questionCount={questionCount} />
      </section>

      <section className="m-sec">
        <div className="eyebrow" style={{ marginBottom: 10 }}>
          클럽
        </div>
        <div className="m-list">
          <div className="m-list-row">
            <span aria-hidden style={{ color: "var(--text-2)", fontSize: 18 }}>
              □
            </span>
            <div>
              <div className="body" style={{ fontSize: 14, fontWeight: 500 }}>
                {clubDisplayName(data)}
              </div>
              <div className="tiny">{membershipJoinedLine(data)}</div>
            </div>
            <span aria-hidden style={{ color: "var(--text-3)" }}>
              ›
            </span>
          </div>
        </div>
      </section>

      <section className="m-sec">
        <div className="eyebrow" style={{ marginBottom: 10 }}>
          읽기 전용 설정
        </div>
        <div className="m-list">
          {[
            { icon: "♢", label: "알림", value: "현재 기본값", reason: "준비 중" },
            { icon: "□", label: "캘린더 연동", value: "연결 안 됨", reason: "준비 중" },
            { icon: "◇", label: "테마 · 표시", value: "라이트", reason: "준비 중" },
          ].map((item) => (
            <div key={item.label} className="m-list-row">
              <span aria-hidden style={{ color: "var(--text-2)", fontSize: 18 }}>
                {item.icon}
              </span>
              <span className="body" style={{ fontSize: 14 }}>
                {item.label}
              </span>
              <div className="m-row" style={{ gap: 6 }}>
                <span className="tiny" style={{ color: "var(--text-3)" }}>
                  {item.value}
                </span>
                <span className="tiny" style={{ color: "var(--text-3)" }}>
                  {item.reason}
                </span>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="m-sec">
        <DangerZone variant="mobile" />
      </section>

      <section className="m-sec">
        <LogoutButton className="btn btn-ghost" style={{ width: "100%", height: 46, borderRadius: 10, color: "var(--text-3)" }}>
          로그아웃
        </LogoutButton>
      </section>
    </div>
  );
}

function MobileFeedbackReports({ reports }: { reports: FeedbackDocumentListItem[] }) {
  const myPageReturnState = readmatesReturnState({ href: "/app/me", label: "내 공간으로 돌아가기" });

  return (
    <section className="m-sec">
      <div className="m-row-between" style={{ marginBottom: 10, alignItems: "center" }}>
        <div className="eyebrow">피드백 문서</div>
        <Link className="m-chip" to="/app/archive?view=report" style={{ height: 30, padding: "0 12px" }}>
          전체 보기
        </Link>
      </div>
      {reports.length === 0 ? (
        <div className="m-card-quiet">
          <p className="small" style={{ color: "var(--text-2)", margin: 0 }}>
            아직 열람 가능한 피드백 문서가 없습니다.
          </p>
        </div>
      ) : (
        <div className="m-list">
          {reports.map((report) => (
            <div key={report.sessionId} className="m-list-row" style={{ gridTemplateColumns: "32px minmax(0, 1fr) auto" }}>
              <span aria-hidden style={{ color: "var(--accent)", fontSize: 18 }}>
                <Icon name="notes" size={18} />
              </span>
              <div style={{ minWidth: 0 }}>
                <div className="body" style={{ fontSize: 14 }}>
                  {report.bookTitle}
                </div>
                <div className="tiny mono" style={{ color: "var(--text-3)" }}>
                  No.{String(report.sessionNumber).padStart(2, "0")} · {formatDateOnlyLabel(report.date)}
                </div>
              </div>
              <div className="m-row" style={{ gap: 4 }}>
                <Link
                  className="btn btn-quiet btn-sm"
                  to={appFeedbackHref(report.sessionId)}
                  state={myPageReturnState}
                  aria-label={feedbackReportActionLabel(report, "읽기")}
                  title={feedbackReportActionLabel(report, "읽기")}
                >
                  <Icon name="arrow-up-right" size={12} />
                </Link>
                <Link
                  className="btn btn-quiet btn-sm"
                  to={appFeedbackHref(report.sessionId, true)}
                  state={myPageReturnState}
                  aria-label={feedbackReportActionLabel(report, "PDF로 저장")}
                  title={feedbackReportActionLabel(report, "PDF로 저장")}
                >
                  <Icon name="download" size={13} />
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function SectionHeader({ eyebrow, title, right }: { eyebrow: string; title: string; right?: React.ReactNode }) {
  return (
    <div className="row-between" style={{ alignItems: "flex-end", marginBottom: "16px" }}>
      <div>
        <div className="eyebrow" style={{ marginBottom: "8px" }}>
          {eyebrow}
        </div>
        <h2 className="h2" style={{ margin: 0 }}>
          {title}
        </h2>
      </div>
      {right}
    </div>
  );
}

type IconName = "arrow-up-right" | "download" | "edit" | "eye" | "me" | "notes" | "settings";

function Icon({ name, size = 16 }: { name: IconName; size?: number }) {
  const common = {
    width: size,
    height: size,
    viewBox: "0 0 20 20",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };

  switch (name) {
    case "arrow-up-right":
      return (
        <svg {...common}>
          <path d="M6 14L14 6M7 6h7v7" />
        </svg>
      );
    case "download":
      return (
        <svg {...common}>
          <path d="M10 3v10M5 9l5 4 5-4M4 17h12" />
        </svg>
      );
    case "edit":
      return (
        <svg {...common}>
          <path d="M4 16h3l8-8-3-3-8 8v3zM12 5l3 3" />
        </svg>
      );
    case "eye":
      return (
        <svg {...common}>
          <path d="M2 10s3-6 8-6 8 6 8 6-3 6-8 6-8-6-8-6z" />
          <circle cx="10" cy="10" r="2.5" />
        </svg>
      );
    case "me":
      return (
        <svg {...common}>
          <circle cx="10" cy="7" r="3" />
          <path d="M4 17c0-3.3 2.7-6 6-6s6 2.7 6 6" />
        </svg>
      );
    case "notes":
      return (
        <svg {...common}>
          <path d="M5 3h7l3 3v11a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" />
          <path d="M12 3v3h3M7 10h6M7 13h4" />
        </svg>
      );
    case "settings":
      return (
        <svg {...common}>
          <circle cx="10" cy="10" r="2.5" />
          <path d="M10 2v2M10 16v2M2 10h2M16 10h2M4.2 4.2l1.5 1.5M14.3 14.3l1.5 1.5M4.2 15.8l1.5-1.5M14.3 5.7l1.5-1.5" />
        </svg>
      );
  }
}

function AccountSection({ data }: { data: MyPageResponse }) {
  return (
    <section>
      <SectionHeader eyebrow="멤버 정체성" title="계정" />
      <div className="surface" style={{ padding: "26px" }}>
        <div className="row" style={{ gap: "16px" }}>
          <AvatarChip name={data.displayName} fallbackInitial={data.shortName} label={data.displayName} size={52} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="h4 editorial">{data.displayName}</div>
            <div className="small">{data.email}</div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "10px", flexShrink: 0 }}>
            <span className="tiny" aria-label="프로필 수정 준비 중" style={{ color: "var(--text-3)", flexShrink: 0 }}>
              프로필 수정 준비 중
            </span>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
              <LogoutButton className="btn btn-ghost btn-sm" style={{ color: "var(--text-3)" }}>
                로그아웃
              </LogoutButton>
            </div>
          </div>
        </div>
        <hr className="divider-soft" style={{ margin: "20px 0" }} />
        <dl
          className="rm-account-keyval"
          style={{
            display: "grid",
            gridTemplateColumns: "auto 1fr",
            columnGap: "16px",
            rowGap: "8px",
            margin: 0,
            fontSize: "13px",
          }}
        >
          {[
            ["멤버 상태", membershipIdentityLabel(data)],
            ["클럽", clubDisplayName(data)],
            ["합류", formatJoinedMonth(data.joinedAt)],
            ["참석 회차", `${data.sessionCount}회 참석`],
          ].map(([label, value]) => (
            <KeyValue key={label} label={label} value={value} />
          ))}
        </dl>
      </div>
    </section>
  );
}

function RhythmSection({
  data,
  reviewCount,
  questionCount,
}: {
  data: MyPageResponse;
  reviewCount: number;
  questionCount: number;
}) {
  const totalSessionCount = Math.max(data.totalSessionCount ?? data.sessionCount, data.sessionCount);
  const attendanceRate = totalSessionCount > 0 ? Math.round((data.sessionCount / totalSessionCount) * 100) : 0;
  const recentAttendances = data.recentAttendances ?? [];
  const firstRecent = recentAttendances.at(0)?.sessionNumber;
  const lastRecent = recentAttendances.at(-1)?.sessionNumber;
  const stats = [
    { key: "참석", value: String(data.sessionCount), sub: `/${totalSessionCount}` },
    { key: "완독률", value: String(attendanceRate), sub: "%" },
    { key: "질문", value: String(questionCount), sub: "개" },
    { key: "서평", value: String(reviewCount), sub: "편" },
  ];

  return (
    <section>
      <SectionHeader eyebrow="읽기 기록" title="나의 리듬" />
      <div className="surface" style={{ padding: "26px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "14px", marginBottom: "20px" }}>
          {stats.map((stat) => (
            <div key={stat.key}>
              <div className="tiny">{stat.key}</div>
              <div className="editorial" style={{ fontSize: "30px", lineHeight: 1, marginTop: "6px" }}>
                {stat.value}
                <span className="tiny mono" style={{ color: "var(--text-3)", marginLeft: "3px" }}>
                  {stat.sub}
                </span>
              </div>
            </div>
          ))}
        </div>
        {recentAttendances.length > 0 ? (
          <>
            <div className="tiny" style={{ color: "var(--text-3)", marginBottom: "8px" }}>
              최근 {recentAttendances.length}회 참석
            </div>
            <div className="row" style={{ gap: "4px" }}>
              {recentAttendances.map((attendance) => (
                <div
                  key={attendance.sessionNumber}
                  className="rm-rhythm-attendance-bar"
                  aria-label={`No.${attendance.sessionNumber} ${attendance.attended ? "참석" : "불참"}`}
                  style={{
                    flex: 1,
                    height: "24px",
                    borderRadius: "2px",
                    background: attendance.attended ? "var(--accent-soft)" : "var(--bg-sub)",
                    border: `1px solid ${attendance.attended ? "var(--accent-line)" : "var(--line-soft)"}`,
                  }}
                />
              ))}
            </div>
            <div className="row-between" style={{ marginTop: "6px" }}>
              <span className="tiny mono" style={{ color: "var(--text-3)" }}>
                No.{firstRecent}
              </span>
              <span className="tiny mono" style={{ color: "var(--text-3)" }}>
                No.{lastRecent}
              </span>
            </div>
          </>
        ) : (
          <div className="surface-quiet" style={{ padding: "16px 18px" }}>
            <p className="small" style={{ color: "var(--text-2)", margin: 0 }}>
              아직 최근 참석 데이터가 없습니다.
            </p>
          </div>
        )}
      </div>
    </section>
  );
}

function FeedbackReports({ reports }: { reports: FeedbackDocumentListItem[] }) {
  const myPageReturnState = readmatesReturnState({ href: "/app/me", label: "내 공간으로 돌아가기" });

  return (
    <section>
      <SectionHeader
        eyebrow="기록"
        title="피드백 문서"
        right={
          <Link className="btn btn-quiet btn-sm" to="/app/archive?view=report">
            전체 보기
          </Link>
        }
      />
      <div className="stack" style={{ "--stack": "0px" } as CSSProperties}>
        {reports.length === 0 ? (
          <div className="surface-quiet" style={{ padding: "22px" }}>
            <p className="small" style={{ color: "var(--text-2)", margin: 0 }}>
              아직 열람 가능한 피드백 문서가 없습니다.
            </p>
          </div>
        ) : null}
        {reports.map((report, index) => (
          <article
            key={report.sessionId}
            style={{
              display: "grid",
              gridTemplateColumns: "28px minmax(0, 1fr) auto auto",
              gap: "14px",
              padding: "16px 0",
              borderTop: index === 0 ? "1px solid var(--line)" : "1px solid var(--line-soft)",
              alignItems: "center",
            }}
          >
            <span aria-hidden style={{ color: "var(--accent)", fontSize: "18px" }}>
              <Icon name="notes" size={18} />
            </span>
            <div style={{ minWidth: 0 }}>
              <h3 className="body" style={{ fontSize: "14px", margin: 0 }}>
                {report.bookTitle}
              </h3>
              <div className="tiny">{formatDateOnlyLabel(report.date)} · PDF</div>
            </div>
            <Link
              className="btn btn-quiet btn-sm"
              to={appFeedbackHref(report.sessionId)}
              state={myPageReturnState}
              aria-label={feedbackReportActionLabel(report, "읽기")}
              title={feedbackReportActionLabel(report, "읽기")}
            >
              <Icon name="arrow-up-right" size={12} />
            </Link>
            <Link
              className="btn btn-quiet btn-sm"
              to={appFeedbackHref(report.sessionId, true)}
              state={myPageReturnState}
              aria-label={feedbackReportActionLabel(report, "PDF로 저장")}
              title={feedbackReportActionLabel(report, "PDF로 저장")}
            >
              <Icon name="download" size={13} />
            </Link>
          </article>
        ))}
      </div>
    </section>
  );
}

function WritingSection({ reviewCount, questionCount }: { reviewCount: number; questionCount: number }) {
  return (
    <section>
      <SectionHeader eyebrow="내 글" title="내가 남긴 문장" />
      <div style={{ padding: "4px 0", borderTop: "1px solid var(--line)", borderBottom: "1px solid var(--line)" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "18px" }}>
          <WritingCountCard label="질문" value={questionCount} body="모임 전에 꺼낸 질문과 초안" href="/app/archive?view=questions" />
          <WritingCountCard label="서평" value={reviewCount} body="한줄평과 장문 서평" href="/app/archive?view=reviews" />
        </div>
      </div>
    </section>
  );
}

function WritingCountCard({ label, value, body, href }: { label: string; value: number; body: string; href: string }) {
  return (
    <Link to={href} style={{ display: "block", padding: "18px 20px", background: "var(--bg-sub)", borderRadius: "var(--r-2)" }}>
      <div className="tiny mono" style={{ color: "var(--text-3)" }}>
        {label}
      </div>
      <div className="editorial" style={{ fontSize: 30, lineHeight: 1, marginTop: 8 }}>
        {value}
        <span className="tiny mono" style={{ marginLeft: 4, color: "var(--text-3)" }}>
          개
        </span>
      </div>
      <p className="small" style={{ margin: "10px 0 0", color: "var(--text-2)" }}>
        {body}
      </p>
    </Link>
  );
}

function MobileWritingSection({ reviewCount, questionCount }: { reviewCount: number; questionCount: number }) {
  return (
    <div className="m-card-quiet">
      <div className="eyebrow">내 글</div>
      <div className="m-row" style={{ gap: 10, marginTop: 12 }}>
        <Link to="/app/archive?view=questions" className="m-chip" style={{ height: 34, padding: "0 12px" }}>
          질문 {questionCount}
        </Link>
        <Link to="/app/archive?view=reviews" className="m-chip" style={{ height: 34, padding: "0 12px" }}>
          서평 {reviewCount}
        </Link>
      </div>
      <p className="small" style={{ color: "var(--text-2)", margin: "12px 0 0" }}>
        내가 남긴 질문과 서평은 아카이브의 보존 기록으로 이어집니다.
      </p>
    </div>
  );
}

function feedbackReportActionLabel(report: FeedbackDocumentListItem, action: "읽기" | "PDF로 저장") {
  return `No.${String(report.sessionNumber).padStart(2, "0")} ${report.bookTitle} · ${report.title} ${action}`;
}

function NotificationsSection() {
  return (
    <section>
      <SectionHeader eyebrow="읽기 전용 설정" title="알림" />
      <div className="surface" style={{ padding: "6px" }}>
        {notifications.map((notification, index) => (
          <div
            key={notification.label}
            className="row-between"
            style={{ padding: "14px 18px", borderTop: index === 0 ? "none" : "1px solid var(--line-soft)" }}
          >
            <div>
              <div className="body" style={{ fontSize: "14px", fontWeight: 500 }}>
                {notification.label}
              </div>
              <div className="tiny">{notification.sub}</div>
            </div>
            <span
              className="tiny"
              aria-label={`${notification.label} 알림 설정 준비 중`}
              style={{
                minWidth: "74px",
                height: "24px",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                padding: "0 9px",
                borderRadius: 999,
                border: "1px solid var(--line-soft)",
                color: "var(--text-3)",
                background: "var(--bg-sub)",
                flexShrink: 0,
              }}
            >
              준비 중
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

function PreferencesSection({ data }: { data: MyPageResponse }) {
  const preferences = [
    { label: "표시 이름", sub: identityLine(data), icon: "me" as const },
    { label: "기록 공개 범위", sub: "클럽 내부 전체", icon: "eye" as const },
    { label: "언어", sub: "한국어", icon: "settings" as const },
  ];

  return (
    <section>
      <SectionHeader eyebrow="읽기 전용 설정" title="개인 설정" />
      <div className="surface" style={{ padding: "4px" }}>
        {preferences.map((preference, index) => (
          <div
            key={preference.label}
            style={{
              display: "grid",
              gridTemplateColumns: "28px minmax(0, 1fr) auto",
              gap: "14px",
              padding: "16px 18px",
              borderTop: index > 0 ? "1px solid var(--line-soft)" : "none",
              alignItems: "center",
            }}
          >
            <span aria-hidden style={{ color: "var(--text-3)" }}>
              <Icon name={preference.icon} size={16} />
            </span>
            <div>
              <div className="body" style={{ fontSize: "14px" }}>
                {preference.label}
              </div>
              <div className="tiny">{preference.sub}</div>
            </div>
            <span className="tiny" aria-label={`${preference.label} 변경 준비 중`} style={{ color: "var(--text-3)" }}>
              변경 준비 중
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

function DangerZone({ variant = "desktop" }: { variant?: "desktop" | "mobile" }) {
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [leaveMessage, setLeaveMessage] = useState<string | null>(null);
  const [leaveError, setLeaveError] = useState<string | null>(null);
  const [isLeaving, setIsLeaving] = useState(false);
  const isMobile = variant === "mobile";

  const handleLeave = async () => {
    setIsLeaving(true);
    setLeaveError(null);

    try {
      const response = await readmatesFetchResponse("/api/me/membership/leave", {
        method: "POST",
        body: JSON.stringify({ currentSessionPolicy: "APPLY_NOW" }),
      });

      if (!response.ok) {
        throw new Error("Leave membership failed");
      }

      setLeaveMessage("탈퇴 처리되었습니다.");
      globalThis.location.href = "/about";
    } catch {
      setLeaveError("탈퇴 처리에 실패했습니다. 잠시 후 다시 시도해 주세요.");
    } finally {
      setIsLeaving(false);
    }
  };

  return (
    <section className={isMobile ? "m-card-quiet" : "surface-quiet"} style={{ padding: isMobile ? "18px" : "22px" }}>
      <div className="eyebrow" style={{ marginBottom: "10px" }}>
        계정 경계
      </div>
      <div className={isMobile ? "m-row-between" : "row-between"} style={{ gap: "16px", alignItems: "flex-start" }}>
        <div className="small" style={{ color: "var(--text-2)" }}>
          클럽 탈퇴 · 내 기록은 유지, 내 이름은 비공개 처리됩니다.
        </div>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setLeaveOpen((current) => !current)}>
          탈퇴
        </button>
      </div>
      {leaveOpen ? (
        <div className={isMobile ? "m-card" : "surface"} style={{ padding: "18px", marginTop: "16px" }}>
          <p className="small" style={{ color: "var(--text-2)", margin: 0 }}>
            탈퇴하면 과거 기록은 보존되며, 다른 멤버에게는 작성자가 "탈퇴한 멤버"로 표시됩니다.
          </p>
          <div className={isMobile ? "m-row" : "row"} style={{ justifyContent: "flex-end", gap: "8px", marginTop: "14px" }}>
            <button type="button" className="btn btn-quiet btn-sm" disabled={isLeaving} onClick={() => setLeaveOpen(false)}>
              취소
            </button>
            <button type="button" className="btn btn-primary btn-sm" disabled={isLeaving} onClick={handleLeave}>
              탈퇴 확인
            </button>
          </div>
        </div>
      ) : null}
      {leaveMessage ? (
        <p role="status" className="small" style={{ color: "var(--ok)", margin: "14px 0 0" }}>
          {leaveMessage}
        </p>
      ) : null}
      {leaveError ? (
        <p role="alert" className="small" style={{ color: "var(--danger)", margin: "14px 0 0" }}>
          {leaveError}
        </p>
      ) : null}
    </section>
  );
}

function KeyValue({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt className="eyebrow" style={{ alignSelf: "center" }}>
        {label}
      </dt>
      <dd style={{ margin: 0, color: "var(--text)" }}>{value}</dd>
    </>
  );
}

const JOINED_MONTH_PATTERN = /^(\d{4})-(\d{2})$/;

function formatJoinedMonth(joinedAt: string) {
  if (!joinedAt.trim()) {
    return "합류 전";
  }

  const monthMatch = JOINED_MONTH_PATTERN.exec(joinedAt.trim());
  if (monthMatch) {
    const [, year, month] = monthMatch;
    const monthNumber = Number(month);
    if (monthNumber >= 1 && monthNumber <= 12) {
      return `${year}.${month}`;
    }
  }

  return formatDateOnlyLabel(joinedAt).slice(0, 7);
}

function identityLine(data: MyPageResponse) {
  const localPart = data.email.split("@")[0] || data.shortName || data.displayName;
  return `${data.displayName} · @${localPart}`;
}
