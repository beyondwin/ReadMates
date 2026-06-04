import type { CSSProperties } from "react";
import type {
  ArchiveQuestionItem,
  ArchiveReviewItem,
  FeedbackDocumentListItem,
  MyPageProfile,
  NotificationPreferences,
} from "@/features/archive/model/archive-model";
import type { PagedResponse } from "@/shared/model/paging";
import { DangerZone } from "./danger-zone";
import { FeedbackReports } from "./feedback-reports";
import { PreferencesSection } from "./preferences-section";
import { AccountSection, NotificationsSection, RhythmSection, WritingSection } from "./my-page-sections";
import { ReadingJourneySection } from "./reading-journey-section";
import type { LogoutControlComponent, ProfileUpdateResult } from "./types";

export function MyDesktop({
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
            <AccountSection data={data} LogoutButtonComponent={LogoutButtonComponent} canEditProfile={canEditProfile} />
            <RhythmSection data={data} reviewCount={reviewCount} questionCount={questionCount} />
            <WritingSection reviewCount={reviewCount} questionCount={questionCount} />
            <ReadingJourneySection questions={questions} reviews={reviews} />
            <FeedbackReports reports={reports} onLoadMoreReports={onLoadMoreReports} />
          </div>

          <div className="stack" style={{ "--stack": "36px" } as CSSProperties}>
            {canManageNotificationPreferences ? (
              <NotificationsSection preferences={notificationPreferences} onSave={onSaveNotificationPreferences} />
            ) : null}
            <PreferencesSection data={data} canEditProfile={canEditProfile} onUpdateProfile={onUpdateProfile} />
            <DangerZone onLeaveMembership={onLeaveMembership} />
          </div>
        </div>
      </section>
    </>
  );
}
