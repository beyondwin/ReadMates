import type { CSSProperties } from "react";
import type {
  ArchiveQuestionItem,
  ArchiveReviewItem,
  FeedbackDocumentListItem,
  MyPageProfile,
  NotificationPreferences,
} from "@/features/archive/model/archive-model";
import { clubDisplayName, formatJoinedMonth } from "@/features/archive/model/archive-model";
import { Link } from "@/features/archive/ui/archive-link";
import { AvatarChip } from "@/shared/ui/avatar-chip";
import type { PagedResponse } from "@/shared/model/paging";
import { DangerZone } from "./danger-zone";
import { MobileFeedbackReports } from "./feedback-reports";
import { mobileMembershipStatusLabel } from "./my-page-helpers";
import { NotificationsSection } from "./my-page-sections";
import { ProfileNameEditor } from "./profile-name-editor";
import { ReadingJourneySection } from "./reading-journey-section";
import type { LogoutControlComponent, ProfileUpdateResult } from "./types";

export function MyMobile({
  data,
  reports,
  questions,
  reviews,
  reviewCount,
  questionCount,
  LogoutButtonComponent,
  onLeaveMembership,
  canEditProfile,
  onUpdateProfile,
  notificationPreferences,
  onSaveNotificationPreferences,
  canManageNotificationPreferences,
  onLoadMoreReports,
}: {
  data: MyPageProfile;
  reports: PagedResponse<FeedbackDocumentListItem>;
  questions: ArchiveQuestionItem[];
  reviews: ArchiveReviewItem[];
  reviewCount: string;
  questionCount: string;
  LogoutButtonComponent: LogoutControlComponent;
  onLeaveMembership: () => Promise<void>;
  canEditProfile: boolean;
  onUpdateProfile: (displayName: string) => Promise<ProfileUpdateResult>;
  notificationPreferences: NotificationPreferences;
  onSaveNotificationPreferences: (preferences: NotificationPreferences) => Promise<NotificationPreferences>;
  canManageNotificationPreferences: boolean;
  onLoadMoreReports?: () => Promise<void>;
}) {
  return (
    <div className="rm-my-mobile m-body">
      <section style={{ padding: "24px 18px 8px" }}>
        <div className="m-card">
          <div className="m-row" style={{ gap: 14 }}>
            <AvatarChip name={data.displayName} fallbackInitial={data.displayName} label={data.displayName} size={56} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="h3 editorial">{data.displayName}</div>
              <div className="small">{data.email}</div>
            </div>
          </div>
          {canEditProfile ? (
            <ProfileNameEditor
              data={data}
              onUpdateProfile={onUpdateProfile}
              variant="mobile"
            />
          ) : null}
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

      <section className="m-sec">
        <ReadingJourneySection questions={questions} reviews={reviews} />
      </section>

      <MobileFeedbackReports reports={reports} onLoadMoreReports={onLoadMoreReports} />

      {canManageNotificationPreferences ? (
        <NotificationsSection
          preferences={notificationPreferences}
          onSave={onSaveNotificationPreferences}
          variant="mobile"
        />
      ) : null}

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
