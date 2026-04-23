import { type CSSProperties, type ReactNode, useState } from "react";
import type { FeedbackDocumentListItem, MyPageProfile } from "@/features/archive/model/archive-model";
import {
  attendanceSummary,
  clubDisplayName,
  feedbackReportActionLabel,
  formatJoinedMonth,
  identityLine,
  membershipIdentityLabel,
} from "@/features/archive/model/archive-model";
import { Link } from "@/features/archive/ui/archive-link";
import { appFeedbackHref, readmatesReturnState } from "@/features/archive/ui/archive-route-continuity";
import { feedbackDocumentPdfDownloadsEnabled } from "@/shared/config/readmates-feature-flags";
import { AvatarChip } from "@/shared/ui/avatar-chip";
import { formatDateOnlyLabel } from "@/shared/ui/readmates-display";

const notifications = [
  { label: "다음 모임 7일 전 리마인더", sub: "책·일정·미팅 URL" },
  { label: "질문 마감 전날 알림", sub: "모임 전날 21시" },
  { label: "피드백 문서 등록 알림", sub: "내 문서가 올라오면" },
  { label: "다른 멤버의 서평 공개", sub: "같은 책에 한해" },
];

function feedbackReportTotalLabel(total: number) {
  return `전체 ${total}개`;
}

type MyPageProps = {
  data: MyPageProfile;
  reports: FeedbackDocumentListItem[];
  reviewCount: number;
  questionCount: number;
  LogoutButtonComponent: LogoutControlComponent;
  onLeaveMembership: () => Promise<void>;
};

export type LogoutControlComponent = (props: {
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
}) => ReactNode;

export default function MyPage({
  data,
  reports,
  reviewCount,
  questionCount,
  LogoutButtonComponent,
  onLeaveMembership,
}: MyPageProps) {
  return (
    <main className="rm-my-page">
      <div className="desktop-only">
        <MyDesktop
          data={data}
          reports={reports}
          reviewCount={reviewCount}
          questionCount={questionCount}
          LogoutButtonComponent={LogoutButtonComponent}
          onLeaveMembership={onLeaveMembership}
        />
      </div>
      <div className="mobile-only">
        <MyMobile
          data={data}
          reports={reports}
          reviewCount={reviewCount}
          questionCount={questionCount}
          LogoutButtonComponent={LogoutButtonComponent}
          onLeaveMembership={onLeaveMembership}
        />
      </div>
    </main>
  );
}

function MyDesktop({
  data,
  reports,
  reviewCount,
  questionCount,
  LogoutButtonComponent,
  onLeaveMembership,
}: {
  data: MyPageProfile;
  reports: FeedbackDocumentListItem[];
  reviewCount: number;
  questionCount: number;
  LogoutButtonComponent: LogoutControlComponent;
  onLeaveMembership: () => Promise<void>;
}) {
  return (
    <>
      <section className="page-header-compact" style={{ paddingBottom: 0 }}>
        <div className="container">
          <p className="eyebrow" style={{ margin: 0 }}>
            내 공간
          </p>
          <h1 className="h1 editorial" style={{ margin: "6px 0 4px" }}>
            계정과 기록
          </h1>
          <p className="small" style={{ color: "var(--text-2)", margin: 0 }}>
            멤버 정체성, 참석, 내가 쓴 기록, 계정 경계를 확인합니다.
          </p>
        </div>
      </section>

      <section style={{ padding: "28px 0 80px" }}>
        <div className="container" style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.1fr) minmax(320px, 1fr)", gap: "56px" }}>
          <div className="stack" style={{ "--stack": "44px" } as CSSProperties}>
            <AccountSection data={data} LogoutButtonComponent={LogoutButtonComponent} />
            <RhythmSection data={data} reviewCount={reviewCount} questionCount={questionCount} />
            <WritingSection reviewCount={reviewCount} questionCount={questionCount} />
            <FeedbackReports reports={reports} />
          </div>

          <div className="stack" style={{ "--stack": "36px" } as CSSProperties}>
            <NotificationsSection />
            <PreferencesSection data={data} />
            <DangerZone onLeaveMembership={onLeaveMembership} />
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
  LogoutButtonComponent,
  onLeaveMembership,
}: {
  data: MyPageProfile;
  reports: FeedbackDocumentListItem[];
  reviewCount: number;
  questionCount: number;
  LogoutButtonComponent: LogoutControlComponent;
  onLeaveMembership: () => Promise<void>;
}) {
  return (
    <div className="rm-my-mobile m-body">
      <section style={{ padding: "24px 18px 8px" }}>
        <div className="m-card">
          <div className="m-row" style={{ gap: 14 }}>
            <AvatarChip name={data.displayName} fallbackInitial={data.shortName} label={data.displayName} size={56} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="h3 editorial">{data.displayName}</div>
              <div className="small">{data.email}</div>
            </div>
          </div>
          <dl
            aria-label="멤버 정보"
            style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 12, margin: "16px 0 0" }}
          >
            {[
              ["멤버 상태", mobileMembershipStatusLabel(data)],
              ["클럽", clubDisplayName(data)],
              ["합류", formatJoinedMonth(data.joinedAt)],
            ].map(([label, value]) => (
              <div key={label} style={{ minWidth: 0 }}>
                <dt className="tiny mono" style={{ color: "var(--text-3)" }}>
                  {label}
                </dt>
                <dd className="body" style={{ fontSize: 13, fontWeight: 600, margin: "5px 0 0", wordBreak: "keep-all" }}>
                  {value}
                </dd>
              </div>
            ))}
          </dl>
          <hr className="divider-soft" style={{ margin: "16px 0 14px" }} />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, textAlign: "center" }}>
            {[
              { label: "참석", value: String(data.sessionCount) },
              { label: "서평", value: String(reviewCount), href: "/app/archive?view=reviews" },
              { label: "질문", value: String(questionCount), href: "/app/archive?view=questions" },
            ].map((item) => {
              const content = (
                <>
                  <div className="editorial" style={{ fontSize: 22, letterSpacing: 0 }}>
                    {item.value}
                  </div>
                  <div className="tiny mono" style={{ color: "var(--text-3)", marginTop: 2 }}>
                    {item.label}
                  </div>
                </>
              );
              const itemStyle: CSSProperties = { display: "block", padding: "6px 0", borderRadius: 8, color: "inherit", textDecoration: "none" };

              return item.href ? (
                <Link key={item.label} to={item.href} aria-label={`${item.label} ${item.value}`} style={itemStyle}>
                  {content}
                </Link>
              ) : (
                <div key={item.label} style={itemStyle}>
                  {content}
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <MobileFeedbackReports reports={reports} />

      <section className="m-sec">
        <DangerZone variant="mobile" onLeaveMembership={onLeaveMembership} />
      </section>

      <section className="m-sec">
        <LogoutButtonComponent className="btn btn-ghost" style={{ width: "100%", height: 46, borderRadius: 10, color: "var(--text-3)" }}>
          로그아웃
        </LogoutButtonComponent>
      </section>
    </div>
  );
}

function mobileMembershipStatusLabel(data: Pick<MyPageProfile, "role" | "membershipStatus">) {
  return data.membershipStatus === "ACTIVE" ? "정식 멤버" : membershipIdentityLabel(data);
}

function MobileFeedbackReports({ reports }: { reports: FeedbackDocumentListItem[] }) {
  const myPageReturnState = readmatesReturnState({ href: "/app/me", label: "내 공간으로 돌아가기" });
  const recentReports = reports.slice(0, 3);

  return (
    <section className="m-sec">
      <div className="m-row-between" style={{ marginBottom: 10, alignItems: "center" }}>
        <div className="m-row" style={{ gap: 8, minWidth: 0 }}>
          <div className="eyebrow">피드백 문서</div>
          <div className="tiny" style={{ color: "var(--text-3)", whiteSpace: "nowrap" }}>
            · {feedbackReportTotalLabel(reports.length)}
          </div>
        </div>
        <Link className="btn btn-quiet btn-sm" to="/app/archive?view=report">
          전체 보기 →
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
          {recentReports.map((report) => (
            <div key={report.sessionId} className="m-list-row" style={{ gridTemplateColumns: "32px minmax(0, 1fr) auto" }}>
              <span aria-hidden style={{ color: "var(--text-2)", fontSize: 18 }}>
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
                  <Icon name="chevron-right" size={12} />
                </Link>
                {feedbackDocumentPdfDownloadsEnabled ? (
                  <Link
                    className="btn btn-quiet btn-sm"
                    to={appFeedbackHref(report.sessionId, true)}
                    state={myPageReturnState}
                    aria-label={feedbackReportActionLabel(report, "PDF로 저장")}
                    title={feedbackReportActionLabel(report, "PDF로 저장")}
                  >
                    <Icon name="download" size={13} />
                  </Link>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function SectionHeader({
  eyebrow,
  eyebrowHelper,
  title,
  right,
}: {
  eyebrow: string;
  eyebrowHelper?: React.ReactNode;
  title: string;
  right?: React.ReactNode;
}) {
  return (
    <div className="row-between" style={{ alignItems: "flex-end", marginBottom: "16px" }}>
      <div>
        <div className="row" style={{ gap: 8, alignItems: "baseline", flexWrap: "wrap", marginBottom: "8px" }}>
          <div className="eyebrow">{eyebrow}</div>
          {eyebrowHelper}
        </div>
        <h2 className="h2" style={{ margin: 0 }}>
          {title}
        </h2>
      </div>
      {right}
    </div>
  );
}

type IconName = "arrow-up-right" | "chevron-right" | "download" | "edit" | "eye" | "me" | "notes" | "settings";

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
    case "chevron-right":
      return (
        <svg {...common}>
          <path d="M8 5l5 5-5 5" />
        </svg>
      );
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

function AccountSection({
  data,
  LogoutButtonComponent,
}: {
  data: MyPageProfile;
  LogoutButtonComponent: LogoutControlComponent;
}) {
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
              <LogoutButtonComponent className="btn btn-ghost btn-sm" style={{ color: "var(--text-3)" }}>
                로그아웃
              </LogoutButtonComponent>
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
  data: MyPageProfile;
  reviewCount: number;
  questionCount: number;
}) {
  const summary = attendanceSummary(data);
  const recentAttendances = data.recentAttendances ?? [];
  const firstRecent = recentAttendances.at(0)?.sessionNumber;
  const lastRecent = recentAttendances.at(-1)?.sessionNumber;
  const stats = [
    { key: "참석", value: String(summary.attended), sub: `/${summary.total}` },
    { key: "완독률", value: String(summary.rate), sub: "%" },
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
  const recentReports = reports.slice(0, 3);

  return (
    <section>
      <SectionHeader
        eyebrow="기록"
        title="피드백 문서"
        eyebrowHelper={
          <span className="tiny" style={{ color: "var(--text-3)", whiteSpace: "nowrap" }}>
            · {feedbackReportTotalLabel(reports.length)}
          </span>
        }
        right={
          <Link className="btn btn-quiet btn-sm" to="/app/archive?view=report">
            전체 보기 →
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
        {recentReports.map((report, index) => (
          <article
            key={report.sessionId}
            style={{
              display: "grid",
              gridTemplateColumns: feedbackDocumentPdfDownloadsEnabled
                ? "28px minmax(0, 1fr) auto auto"
                : "28px minmax(0, 1fr) auto",
              gap: "14px",
              padding: "16px 0",
              borderTop: index === 0 ? "1px solid var(--line)" : "1px solid var(--line-soft)",
              alignItems: "center",
            }}
          >
            <span aria-hidden style={{ color: "var(--text-2)", fontSize: "18px" }}>
              <Icon name="notes" size={18} />
            </span>
            <div style={{ minWidth: 0 }}>
              <h3 className="body" style={{ fontSize: "14px", margin: 0 }}>
                {report.bookTitle}
              </h3>
              <div className="tiny">{formatDateOnlyLabel(report.date)} · 피드백 문서</div>
            </div>
            <Link
              className="btn btn-quiet btn-sm"
              to={appFeedbackHref(report.sessionId)}
              state={myPageReturnState}
              aria-label={feedbackReportActionLabel(report, "읽기")}
              title={feedbackReportActionLabel(report, "읽기")}
            >
              <Icon name="chevron-right" size={12} />
            </Link>
            {feedbackDocumentPdfDownloadsEnabled ? (
              <Link
                className="btn btn-quiet btn-sm"
                to={appFeedbackHref(report.sessionId, true)}
                state={myPageReturnState}
                aria-label={feedbackReportActionLabel(report, "PDF로 저장")}
                title={feedbackReportActionLabel(report, "PDF로 저장")}
              >
                <Icon name="download" size={13} />
              </Link>
            ) : null}
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
          <WritingCountCard label="서평" value={reviewCount} body="회차별로 남긴 장문 서평" href="/app/archive?view=reviews" />
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

function PreferencesSection({ data }: { data: MyPageProfile }) {
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

function DangerZone({
  variant = "desktop",
  onLeaveMembership,
}: {
  variant?: "desktop" | "mobile";
  onLeaveMembership: () => Promise<void>;
}) {
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [leaveMessage, setLeaveMessage] = useState<string | null>(null);
  const [leaveError, setLeaveError] = useState<string | null>(null);
  const [isLeaving, setIsLeaving] = useState(false);
  const isMobile = variant === "mobile";
  const actionButtonStyle: CSSProperties = { whiteSpace: "nowrap", flexShrink: 0 };

  const handleLeave = async () => {
    setIsLeaving(true);
    setLeaveError(null);

    try {
      await onLeaveMembership();
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
        <button type="button" className="btn btn-ghost btn-sm" style={actionButtonStyle} onClick={() => setLeaveOpen((current) => !current)}>
          탈퇴
        </button>
      </div>
      {leaveOpen ? (
        <div className={isMobile ? "m-card" : "surface"} style={{ padding: "18px", marginTop: "16px" }}>
          <p className="small" style={{ color: "var(--text-2)", margin: 0 }}>
            탈퇴하면 과거 기록은 보존되며, 다른 멤버에게는 작성자가 "탈퇴한 멤버"로 표시됩니다.
          </p>
          <div className={isMobile ? "m-row" : "row"} style={{ justifyContent: "flex-end", gap: "8px", marginTop: "14px" }}>
            <button type="button" className="btn btn-quiet btn-sm" style={actionButtonStyle} disabled={isLeaving} onClick={() => setLeaveOpen(false)}>
              취소
            </button>
            <button type="button" className="btn btn-primary btn-sm" style={actionButtonStyle} disabled={isLeaving} onClick={handleLeave}>
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
