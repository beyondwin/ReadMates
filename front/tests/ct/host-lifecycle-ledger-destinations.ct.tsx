import { expect, test } from "@playwright/experimental-ct-react";
import type { HostMeetingTocSections } from "@/features/host/model/host-meeting-list-model";
import type { HostPersonDetailView } from "@/features/host/model/host-person-detail-model";
import type { HostSessionLedgerItem } from "@/features/host/model/host-session-ledger-model";
import type { HostMemberListItem } from "@/features/host/model/host-view-types";
import { HostMeetingList } from "@/features/host/ui/meeting-list/host-meeting-list";
import { MemberList } from "@/features/host/ui/members/member-list";
import { HostPersonDetail } from "@/features/host/ui/person/host-person-detail";
import { HostScheduleReviewHeader } from "@/features/host/ui/schedule-review/host-schedule-review-header";
import { HostSessionLedger } from "@/features/host/ui/host-session-ledger";
import {
  expectMinimumTargetSize,
  expectNoHorizontalOverflow,
  expectReducedMotion,
  expectVisibleFocus,
} from "@/tests/e2e/support/visual-authority-contract";
import { HostSettingsDestinationStory } from "./host-settings-destination.story";

const noop = () => undefined;

const meetingSections: HostMeetingTocSections = {
  upcoming: {
    rows: [{ id: "session-28", ordinalFolio: "No.28", title: "파도와 바람의 기록", lifecycleLabel: "준비 중", attentionLabel: null, summary: "09-07 예정일", date: "2026-09-07", href: "/app/host/sessions/session-28" }],
    nextCursor: "opaque-upcoming",
  },
  past: {
    rows: [{ id: "session-27", ordinalFolio: "No.27", title: "느리게 읽는 긴 책 제목", lifecycleLabel: "기록 정리 중", attentionLabel: "기록 확인 필요", summary: "08-20", date: "2026-08-20", href: "/app/host/sessions/session-27" }],
    nextCursor: "opaque-past",
  },
};

const member: HostMemberListItem = {
  membershipId: "membership-7",
  userId: "redacted-fixture",
  email: "hidden@example.test",
  displayName: "정하늘",
  accountName: "redacted-fixture",
  profileImageUrl: null,
  avatarKey: "banana-green-book",
  role: "MEMBER",
  status: "ACTIVE",
  joinedAt: "2025-09-01T09:00:00Z",
  createdAt: "2025-09-01T09:00:00Z",
  lastClubAccessAt: "2026-08-29T10:00:00Z",
  currentSessionParticipationStatus: "ACTIVE",
  canSuspend: true,
  canRestore: false,
  canDeactivate: true,
  canAddToCurrentSession: false,
  canRemoveFromCurrentSession: true,
};

const record: HostSessionLedgerItem = {
  sessionId: "session-27", sessionNumber: 27, title: "스물일곱 번째 모임", bookTitle: "파도와 바람의 기록", bookAuthor: "작가 이름", bookImageUrl: null,
  date: "2026-08-20", startTime: "19:30", endTime: "21:30", locationLabel: "책방 안쪽", state: "CLOSED", visibility: "MEMBER",
  recordStatus: "INCOMPLETE", needsAttention: true, hasDraft: true, liveRevision: 3, draftRevision: 4, lastModifiedAt: "2026-08-21T10:00:00+09:00",
};

const person: HostPersonDetailView = {
  membershipId: "membership-7", displayName: "정하늘", avatarKey: "banana-green-book", status: "ACTIVE", role: "MEMBER",
  lastClubAccessAt: "2026-08-29T10:00:00+09:00", currentSchedule: { state: "OPEN", scheduleRevision: 4, scheduledAt: "2026-09-03T19:30:00" }, currentRsvp: "GOING",
  attendanceHistory: { items: [{ sessionNumber: 7, scheduledAt: "2026-08-20T19:30:00", attendanceStatus: "ATTENDED" }], nextCursor: null },
};

test("surface 10 meetings destination at 1440px", async ({ mount, page }) => {
  await page.setViewportSize({ width: 1440, height: 960 });
  const component = await mount(<HostMeetingList sections={meetingSections} onLoadMoreUpcoming={noop} onLoadMorePast={noop} loadingMoreUpcoming={false} loadingMorePast={false} trashHref="/app/host/sessions?view=trash" newMeetingHref="/app/host/sessions/new" />);
  await component.getByRole("tab", { name: "달력" }).click();
  await expect(component.getByText(/현재 불러온 모임만 표시/)).toBeVisible();
  await expect(component.getByRole("heading", { name: "2026년 9월" })).toBeVisible();
  await expectNoHorizontalOverflow(page);
  const listTab = component.getByRole("tab", { name: "목록" });
  await listTab.focus();
  await expectVisibleFocus(listTab);
});

test("surface 11 people destination at 1440px", async ({ mount, page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const component = await mount(<main><h1>사람</h1><MemberList members={[member]} emptyText="활성 멤버가 없습니다." sectionDescription="활성 멤버 원장" renderProfileAction={() => null} renderActions={() => null} /></main>);
  await expect(component.getByRole("heading", { name: "정하늘" })).toBeVisible();
  await expect(component.getByText("hidden@example.test")).toHaveCount(0);
  await expectNoHorizontalOverflow(page);
});

test("surface 12 records destination at 1440px", async ({ mount, page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const component = await mount(<main><h1>기록</h1><HostSessionLedger items={[record]} summary={{ needsAttentionCount: 1, incompletePublishedCount: 1, draftCount: 1 }} filters={{ view: "active", search: "", state: null, recordStatus: null, needsAttention: null }} nextCursor={null} loadingMore={false} onFiltersChange={noop} onLoadMore={noop} /></main>);
  await expect(component.getByRole("region", { name: "기록 장부 요약" })).toContainText("확인 필요 1건");
  await expect(component.getByRole("table", { name: "모임 기록 장부" })).toBeVisible();
  await expectNoHorizontalOverflow(page);
});

test("surface 13 settings destination at 1440px", async ({ mount, page }) => {
  await page.setViewportSize({ width: 1440, height: 1100 });
  const component = await mount(<HostSettingsDestinationStory />);
  await expect(component.getByRole("heading", { name: "공유 링크" })).toBeVisible();
  await expect(component.getByRole("region", { name: "기존 이메일 초대 호환" })).toBeVisible();
  await expect(component.getByText("revision 7", { exact: true })).toBeVisible();
  await expect(component.getByText("settings revision 7", { exact: true })).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await expectReducedMotion(page);
});

test("surface 14 schedule-review route continuity at 1024px", async ({ mount, page }) => {
  await page.setViewportSize({ width: 1024, height: 900 });
  const component = await mount(<main className="rm-schedule-review"><HostScheduleReviewHeader returnHref="/clubs/reading-sai/app/host" sessionNumber={7} bookTitle="파도와 바람의 기록" scheduleRevision={7} /><section aria-label="대상 확인"><h2>대상 확인</h2><label><input type="checkbox" checked readOnly />변경 전 확인 · 일정 6판 확인</label></section></main>);
  await expect(component.getByRole("heading", { name: "일정 미열람 검토" })).toBeVisible();
  await expect(component.getByRole("link", { name: "운영실로 돌아가기" })).toHaveAttribute("href", "/clubs/reading-sai/app/host");
  await expect(component.getByRole("checkbox", { name: /변경 전 확인/ })).toBeChecked();
  await expectNoHorizontalOverflow(page);
});

test("surface 17 person detail at 390px", async ({ mount, page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const component = await mount(<HostPersonDetail person={person} attendanceItems={person.attendanceHistory.items} nextCursor={null} loadingMore={false} loadMoreError={null} onLoadMore={noop} peopleHref="/app/host/people" now={new Date("2026-08-30T10:00:00+09:00")} />);
  await expect(component.getByRole("heading", { name: "정하늘" })).toBeVisible();
  await expect(component.getByText("페이지 열람 기록은 수집하지 않습니다.")).toBeVisible();
  await expect(component.getByText(/일정 4판/)).toBeVisible();
  await expectNoHorizontalOverflow(page);
  const returnLink = component.getByRole("link", { name: "사람 목록으로" });
  await expectMinimumTargetSize(returnLink);
  await returnLink.focus();
  await expectVisibleFocus(returnLink);
});
